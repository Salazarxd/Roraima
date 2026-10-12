"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError, STAFF_ROLES } from "@/lib/server-auth";
import * as OTPAuth from "otpauth";
import { verifyTotpWithRateLimit } from "@/lib/two-factor-guard";
import { assertProfileComplete, docDigits, kycFullName } from "@/lib/profile";
import { publishTrade } from "@/lib/realtime";
import {
  credit,
  debit,
  refundEscrow,
  round6,
  serializable,
  settleToBuyer,
  systemMessage,
  SYSTEM_USER_ID,
  TradeRuleError,
  withRetry,
  MAKER_FEE_RATE,
  type Tx,
} from "@/lib/ledger";

// ============================================================================
//  POLÍTICAS DE SEGURIDAD P2P (fuente única de verdad: el SERVIDOR)
// ============================================================================
const PAYMENT_WINDOW_MS = 15 * 60 * 1000;      // Tiempo para pagar
// Apelaciones dinámicas: la espera tras "He pagado" depende de lo que tarda en acreditarse cada método
const APPEAL_COOLDOWN_MIN = {
  PAGO_MOVIL: 10, // Interbancario inmediato
  TRANSFER: 30,   // Transferencias entre bancos pueden tardar en reflejarse
  OTHER: 15,      // Método desconocido u órdenes antiguas sin método registrado
} as const;
const CANCEL_APPEAL_WINDOW_MS = 24 * 60 * 60 * 1000; // Ventana para apelar una cancelación
const MAX_ACTIVE_TRADES_PER_USER = 3;          // Anti-spam / anti "coin locking"
const MAX_BUYER_CANCELS_24H = 3;               // Igual que Binance: 3 cancelaciones/día bloquean nuevas órdenes
const MIN_TRADE_USDT = 1;
const MAX_CHAT_LENGTH = 2000;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACTIVE_STATUSES = ["PENDING_PAYMENT", "PAID", "DISPUTED"];
const DAY_MS = 24 * 60 * 60 * 1000;

const isStaffRole = (role: string) => (STAFF_ROLES as readonly string[]).includes(role);
const isSellAd = (type: string) => type.startsWith("SELL");

function isExpired(trade: { createdAt: Date }, now = Date.now()) {
  return now - trade.createdAt.getTime() >= PAYMENT_WINDOW_MS;
}

function classifyMethod(label: string | null | undefined): keyof typeof APPEAL_COOLDOWN_MIN {
  if (!label) return "OTHER";
  const n = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (n.includes("pago movil")) return "PAGO_MOVIL";
  // El resto de métodos de la plataforma son bancos o transferencias bancarias
  return "TRANSFER";
}

const appealCooldownMin = (method: string | null | undefined) => APPEAL_COOLDOWN_MIN[classifyMethod(method)];
const appealCooldownMs = (method: string | null | undefined) => appealCooldownMin(method) * 60 * 1000;

const methodLabel = (m: { type: string; details: string }) => {
  let bank = "";
  try {
    bank = (JSON.parse(m.details) as { bank?: string }).bank ?? "";
  } catch {
    /* datos corruptos */
  }
  return bank && !m.type.toLowerCase().includes(bank.toLowerCase()) ? `${m.type} · ${bank}` : m.type;
};

const publicName = (u: { name: string | null; firstName?: string | null; lastName?: string | null }) =>
  u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || "Usuario";

/** Oculta parcialmente el nombre de quien deja un comentario (privacidad, estilo Binance: "Ju***"). */
const maskName = (name: string) => (name.length <= 2 ? `${name[0] ?? "U"}***` : `${name.slice(0, 2)}***`);

/**
 * Cancela y devuelve el escrow (al anuncio o a la wallet del vendedor). La transición de
 * estado es condicional (`WHERE status = 'PENDING_PAYMENT'`), así que es imposible
 * reembolsar dos veces.
 */
async function cancelAndRefund(tx: Tx, tradeId: string, reason: string, cancelledBy: string): Promise<boolean> {
  const trade = await tx.p2ptrade.findUnique({ where: { id: tradeId } });
  if (!trade) return false;
  const res = await tx.p2ptrade.updateMany({
    where: { id: tradeId, status: "PENDING_PAYMENT" },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy, escrowHeld: false },
  });
  if (res.count !== 1) return false;

  let dest = "";
  if (trade.escrowHeld) {
    const where = await refundEscrow(tx, trade);
    dest = where === "AD" ? " Los USDT regresaron al anuncio del vendedor." : " Los USDT regresaron a la billetera del vendedor.";
  }
  await systemMessage(tx, tradeId, `Orden cancelada: ${reason}.${dest}`);
  return true;
}

/** Carga la orden y valida que el usuario sea parte (o staff). */
async function loadTradeForUser(tradeId: string, user: { id: string; role: string }) {
  if (!tradeId || typeof tradeId !== "string") throw new TradeRuleError("Orden no válida");
  const trade = await prisma.p2ptrade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new TradeRuleError("Orden no encontrada");
  const isBuyer = trade.buyerId === user.id;
  const isSeller = trade.sellerId === user.id;
  const isStaff = isStaffRole(user.role);
  if (!isBuyer && !isSeller && !isStaff) throw new TradeRuleError("No tienes acceso a esta orden");
  return { trade, isBuyer, isSeller, isStaff };
}

/** Expira (y reembolsa) en lote todas las órdenes vencidas. Se llama al leer el mercado. */
async function sweepExpiredTrades() {
  const expired = await prisma.p2ptrade.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(Date.now() - PAYMENT_WINDOW_MS) } },
    select: { id: true },
    take: 50,
  });
  for (const t of expired) {
    try {
      const ok = await withRetry(() => prisma.$transaction((tx) => cancelAndRefund(tx, t.id, "tiempo de pago agotado", "TIMEOUT"), serializable));
      if (ok) await publishTrade(t.id, "CANCELLED");
    } catch (e) {
      console.error("sweep error", t.id, e);
    }
  }
}

// ============================================================================
//  SISTEMA DE RANGOS P2P
// ============================================================================

type P2PRank = "HIERRO" | "BRONCE" | "PLATA" | "ORO" | "DIAMANTE";

const RANK_THRESHOLDS: { rank: P2PRank; minCompleted: number; minRate: number; minFeedback: number }[] = [
  { rank: "DIAMANTE", minCompleted: 1000, minRate: 99, minFeedback: 98 },
  { rank: "ORO",      minCompleted: 200,  minRate: 98, minFeedback: 95 },
  { rank: "PLATA",    minCompleted: 50,   minRate: 95, minFeedback: 90 },
  { rank: "BRONCE",   minCompleted: 10,   minRate: 0,  minFeedback: 0 },
  { rank: "HIERRO",   minCompleted: 0,    minRate: 0,  minFeedback: 0 },
];

const RANK_ORDER: Record<P2PRank, number> = { HIERRO: 0, BRONCE: 1, PLATA: 2, ORO: 3, DIAMANTE: 4 };

/** Sin comentarios recibidos se asume 100% (no penaliza a cuentas nuevas). */
function computeRank(totalCompleted: number, completionRate: number | null, feedbackScore: number | null = null): P2PRank {
  const rate = completionRate ?? 0;
  const fb = feedbackScore ?? 100;
  for (const t of RANK_THRESHOLDS) {
    if (totalCompleted >= t.minCompleted && rate >= t.minRate && fb >= t.minFeedback) return t.rank;
  }
  return "HIERRO";
}

/** Requisitos y progreso hacia el siguiente rango (para el Centro de usuario). */
function rankProgress(rank: P2PRank, totalCompleted: number, completionRate: number | null, feedbackScore: number | null) {
  const next = [...RANK_THRESHOLDS].reverse().find((t) => RANK_ORDER[t.rank] === RANK_ORDER[rank] + 1);
  if (!next) return null;
  return {
    rank: next.rank,
    label: RANK_META[next.rank].label,
    emoji: RANK_META[next.rank].emoji,
    requirements: [
      { label: "Órdenes completadas", current: totalCompleted, target: next.minCompleted, unit: "", met: totalCompleted >= next.minCompleted },
      { label: "Tasa de finalización (30d)", current: completionRate ?? 0, target: next.minRate, unit: "%", met: (completionRate ?? 0) >= next.minRate },
      { label: "Comentarios positivos", current: feedbackScore ?? 100, target: next.minFeedback, unit: "%", met: (feedbackScore ?? 100) >= next.minFeedback },
    ].filter((r) => r.target > 0),
  };
}

const RANK_META: Record<P2PRank, { label: string; color: string; emoji: string; description: string }> = {
  HIERRO:   { label: "Hierro",   color: "#6b7280", emoji: "\ud83e\udea8", description: "Comerciante nuevo: a\u00fan construyendo su historial de comercio P2P." },
  BRONCE:   { label: "Bronce",   color: "#b45309", emoji: "\ud83e\udd49", description: "Comerciante Bronce: comerciantes verificados que cuentan con un historial de comercio P2P s\u00f3lido." },
  PLATA:    { label: "Plata",    color: "#94a3b8", emoji: "\ud83e\udd48", description: "Comerciante Plata: historial confiable con alta tasa de finalizaci\u00f3n." },
  ORO:      { label: "Oro",      color: "#d97706", emoji: "\ud83e\udd47", description: "Comerciante Oro: trader experimentado con excelente reputaci\u00f3n y m\u00e1s de 200 operaciones." },
  DIAMANTE: { label: "Diamante", color: "#8b5cf6", emoji: "\ud83d\udc8e", description: "Comerciante Diamante: el nivel m\u00e1s alto de confianza con m\u00e1s de 1000 operaciones y 99%+ de finalizaci\u00f3n." },
};

// ============================================================================
//  REPUTACIÓN (estadísticas de 30 días al estilo Binance)
// ============================================================================

type Reputation = { orders30d: number; completionRate: number | null; avgReleaseMin: number | null; totalCompleted: number; avgPayMin: number | null; feedbackScore: number | null; feedbackPositive: number; feedbackNegative: number };

const EMPTY_REP: Reputation = { orders30d: 0, completionRate: null, avgReleaseMin: null, avgPayMin: null, totalCompleted: 0, feedbackScore: null, feedbackPositive: 0, feedbackNegative: 0 };

async function reputationFor(userIds: string[]): Promise<Record<string, Reputation>> {
  const out: Record<string, Reputation> = {};
  if (userIds.length === 0) return out;
  const since = new Date(Date.now() - 30 * DAY_MS);
  const trades = await prisma.p2ptrade.findMany({
    where: {
      OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }],
      status: { in: ["COMPLETED", "CANCELLED"] },
    },
    select: { buyerId: true, sellerId: true, status: true, createdAt: true, paidAt: true, completedAt: true, cancelledBy: true, resolution: true },
  });
  // Feedback en una sola consulta agrupada (evita N+1)
  const fbRows = await prisma.userfeedback.groupBy({
    by: ["reviewedId", "rating"],
    where: { reviewedId: { in: userIds } },
    _count: { _all: true },
  });
  for (const id of userIds) {
    const mine = trades.filter((t) => t.buyerId === id || t.sellerId === id);
    const recent = mine.filter((t) => t.createdAt >= since);
    const completed = recent.filter((t) => t.status === "COMPLETED");
    // Cuentan en contra: cancelaciones hechas por el usuario o por agotar su tiempo de pago como comprador
    const failed = recent.filter(
      (t) => t.status === "CANCELLED" && (t.cancelledBy === id || (t.cancelledBy === "TIMEOUT" && t.buyerId === id))
    );
    const releases = completed
      .filter((t) => t.sellerId === id && t.paidAt && t.completedAt && !t.resolution)
      .map((t) => (t.completedAt!.getTime() - t.paidAt!.getTime()) / 60000);
    const payments = completed
      .filter((t) => t.buyerId === id && t.paidAt && t.createdAt)
      .map((t) => (t.paidAt!.getTime() - t.createdAt.getTime()) / 60000);
    const denom = completed.length + failed.length;
    
    // Feedback
    const positiveF = fbRows.find((r) => r.reviewedId === id && r.rating === "POSITIVE")?._count._all ?? 0;
    const negativeF = fbRows.find((r) => r.reviewedId === id && r.rating === "NEGATIVE")?._count._all ?? 0;
    const totalF = positiveF + negativeF;
    const feedbackScore = totalF > 0 ? Math.round((positiveF / totalF) * 1000) / 10 : null;

    out[id] = {
      orders30d: completed.length,
      completionRate: denom > 0 ? Math.round((completed.length / denom) * 1000) / 10 : null,
      avgReleaseMin: releases.length ? Math.round((releases.reduce((a, b) => a + b, 0) / releases.length) * 10) / 10 : null,
      avgPayMin: payments.length ? Math.round((payments.reduce((a, b) => a + b, 0) / payments.length) * 10) / 10 : null,
      totalCompleted: mine.filter((t) => t.status === "COMPLETED").length,
      feedbackScore,
      feedbackPositive: positiveF,
      feedbackNegative: negativeF,
    };
  }
  return out;
}

// ============================================================================
//  MERCADO
// ============================================================================

/** Límite máximo REAL de un anuncio en VES (no puede superar la liquidez restante). */
function effectiveLimits(order: { type: string; amount: number; price: number; minAmount: number; maxAmount: number }) {
  // En anuncios de venta, la liquidez congelada también cubre la comisión del anunciante
  const usableCrypto = isSellAd(order.type) ? order.amount / (1 + MAKER_FEE_RATE) : order.amount;
  const liquidityVes = Math.floor(usableCrypto * order.price * 100) / 100;
  const max = order.maxAmount > 0 ? Math.min(order.maxAmount, liquidityVes) : liquidityVes;
  const min = Math.max(order.minAmount, MIN_TRADE_USDT * order.price);
  return { min, max };
}

export async function fetchP2POrders(type: string, idToken?: string) {
  try {
    await sweepExpiredTrades();
    const safeType = type === "BUY" ? "BUY" : "SELL";
    
    let blockedUserIds: string[] = [];
    if (idToken) {
      try {
        const { verifyIdToken } = await import("@/lib/server-auth");
        const identity = await verifyIdToken(idToken);
        const u = await prisma.user.findUnique({ where: { id: identity.uid } });
        if (u) {
          const blocks = await prisma.userblock.findMany({
            where: { OR: [{ blockerId: u.id }, { blockedId: u.id }] }
          });
          blockedUserIds = blocks.map(b => b.blockerId === u.id ? b.blockedId : b.blockerId);
        }
      } catch {
        // Ignorar si el token no es válido o expiró, simplemente no filtramos (vista pública)
      }
    }

    const orders = await prisma.p2porder.findMany({
      where: { 
        type: { startsWith: safeType }, 
        status: "OPEN", 
        amount: { gt: 0 }, 
        user: { role: { notIn: ["BANNED", "SYSTEM"] } },
        ...(blockedUserIds.length > 0 ? { userId: { notIn: blockedUserIds } } : {})
      },
      include: { user: { select: { id: true, name: true, firstName: true, lastName: true, kycStatus: true, vipUntil: true, lastSeenAt: true } } },
      orderBy: [{ price: safeType === "SELL" ? "asc" : "desc" }, { createdAt: "asc" }],
      take: 200,
    });

    const filtered = orders
      .map((o) => ({ o, lim: effectiveLimits(o) }))
      .filter(({ lim }) => lim.max >= lim.min && lim.max > 0);

    const rep = await reputationFor([...new Set(filtered.map(({ o }) => o.userId))]);
    const rankOf = (userId: string): P2PRank => {
      const s = rep[userId] ?? EMPTY_REP;
      return computeRank(s.totalCompleted, s.completionRate, s.feedbackScore);
    };

    // Membresía VIP vigente = anuncio promocionado (sale primero). Dentro de cada grupo: mejor precio;
    // a igual precio, mayor rango (DIAMANTE > ORO > ...) va destacado
    const nowMs = Date.now();
    const isVip = (o: { user: { vipUntil: Date | null } }) => !!o.user.vipUntil && o.user.vipUntil.getTime() > nowMs;
    const visible = filtered.sort((a, b) => {
      const vip = Number(isVip(b.o)) - Number(isVip(a.o));
      if (vip !== 0) return vip;
      if (a.o.price !== b.o.price) return safeType === "SELL" ? a.o.price - b.o.price : b.o.price - a.o.price;
      return RANK_ORDER[rankOf(b.o.userId)] - RANK_ORDER[rankOf(a.o.userId)];
    });

    return visible.map(({ o, lim }) => {
      const stats = rep[o.userId] ?? EMPTY_REP;
      const rank = rankOf(o.userId);
      const lastSeenMs = o.user.lastSeenAt ? o.user.lastSeenAt.getTime() : 0;
      const isOnline = nowMs - lastSeenMs < 5 * 60 * 1000;
      
      return {
        id: o.id,
        type: o.type,
        price: o.price,
        amount: round6(isSellAd(o.type) ? o.amount / (1 + MAKER_FEE_RATE) : o.amount),
        minAmount: Math.round(lim.min * 100) / 100,
        maxAmount: Math.round(lim.max * 100) / 100,
        methods: o.methods,
        user: {
          id: o.user.id,
          name: publicName(o.user),
          kycStatus: o.user.kycStatus,
          rank,
          vip: isVip(o),
          lastSeenAt: o.user.lastSeenAt ? o.user.lastSeenAt.toISOString() : null,
          isOnline,
        },
        stats,
      };
    });
  } catch (error) {
    console.error("Error fetching P2P orders:", error);
    return [];
  }
}

// ============================================================================
//  CICLO DE VIDA DE LA ORDEN
// ============================================================================

type DbUser = Awaited<ReturnType<typeof requireUser>>;

/** Validaciones previas comunes a cualquier toma de anuncio. */
async function assertCanTrade(user: DbUser) {
  assertProfileComplete(user);
  if (user.kycStatus !== "VERIFIED") {
    throw new TradeRuleError("Debes completar tu verificación de identidad (KYC) para operar en P2P");
  }
  const since = new Date(Date.now() - DAY_MS);
  const cancels = await prisma.p2ptrade.count({
    where: { buyerId: user.id, status: "CANCELLED", cancelledAt: { gte: since }, cancelledBy: { in: [user.id, "TIMEOUT"] } },
  });
  if (cancels >= MAX_BUYER_CANCELS_24H) {
    throw new TradeRuleError(`Cancelaste ${cancels} órdenes en las últimas 24 h. Por seguridad no puedes abrir nuevas órdenes por hoy.`);
  }
}

/** Núcleo de apertura de orden (usado por el mercado y por el modo Rápido). */
async function openTrade(user: DbUser, orderId: string, fiatAmount: number, expectedPrice?: number) {
  if (typeof fiatAmount !== "number" || !Number.isFinite(fiatAmount) || fiatAmount <= 0) throw new TradeRuleError("Monto inválido");

  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const order = await tx.p2porder.findUnique({ where: { id: orderId } });
      if (!order || order.status !== "OPEN") throw new TradeRuleError("Este anuncio ya no está disponible");
      // Compra rápida: el usuario confirmó un precio concreto; si el anunciante lo cambió, no se abre
      if (expectedPrice != null && Math.abs(order.price - expectedPrice) > 1e-6) {
        throw new TradeRuleError("El vendedor actualizó su precio. Revisa la nueva cotización antes de confirmar.");
      }

      // El rol lo define el ANUNCIO, nunca el cliente.
      const adIsSell = isSellAd(order.type);
      const buyerId = adIsSell ? user.id : order.userId;
      const sellerId = adIsSell ? order.userId : user.id;
      if (buyerId === sellerId) throw new TradeRuleError("No puedes operar con tu propio anuncio");

      // Lista negra: el bloqueo es bilateral y se aplica también aquí (no solo en el listado)
      const blocked = await tx.userblock.count({
        where: { OR: [{ blockerId: user.id, blockedId: order.userId }, { blockerId: order.userId, blockedId: user.id }] },
      });
      if (blocked > 0) throw new TradeRuleError("No puedes operar con este anunciante");

      const lim = effectiveLimits(order);
      const fiat = Math.round(fiatAmount * 100) / 100;
      if (fiat < lim.min - 0.01) throw new TradeRuleError(`El mínimo de este anuncio es ${lim.min.toFixed(2)} VES`);
      if (fiat > lim.max + 0.01) throw new TradeRuleError(`El máximo disponible en este anuncio es ${lim.max.toFixed(2)} VES`);

      const crypto = round6(fiat / order.price);
      if (crypto < MIN_TRADE_USDT) throw new TradeRuleError(`El monto mínimo por orden es ${MIN_TRADE_USDT} USDT`);

      // Anti "coin locking": límite de órdenes activas simultáneas
      const active = await tx.p2ptrade.count({
        where: { status: { in: ACTIVE_STATUSES }, OR: [{ buyerId: user.id }, { sellerId: user.id }] },
      });
      if (active >= MAX_ACTIVE_TRADES_PER_USER) {
        throw new TradeRuleError(`Tienes ${active} órdenes activas. Finalízalas antes de abrir otra.`);
      }

      // El vendedor debe tener dónde recibir el pago
      const sellerMethods = await tx.userpaymentmethod.count({ where: { userId: sellerId } });
      if (sellerMethods === 0) {
        throw new TradeRuleError(
          sellerId === user.id
            ? "Agrega un método de pago (P2P → Más → Métodos de pago) para poder vender"
            : "El anunciante no tiene métodos de pago configurados"
        );
      }

      const makerFee = round6(crypto * MAKER_FEE_RATE);
      let escrowAmount: number;
      let escrowSource: "AD" | "WALLET";

      if (adIsSell) {
        // Los USDT ya están congelados en el anuncio: se mueven al escrow de la orden (incluye comisión)
        escrowAmount = round6(crypto + makerFee);
        escrowSource = "AD";
        const liq = await tx.p2porder.updateMany({
          where: { id: order.id, status: "OPEN", amount: { gte: escrowAmount } },
          data: { amount: { decrement: escrowAmount } },
        });
        if (liq.count !== 1) throw new TradeRuleError("El anuncio no tiene suficiente liquidez para esta transacción");
      } else {
        // Anuncio de compra: el tomador (vendedor) bloquea sus USDT desde su billetera
        escrowAmount = crypto;
        escrowSource = "WALLET";
        const liq = await tx.p2porder.updateMany({
          where: { id: order.id, status: "OPEN", amount: { gte: crypto } },
          data: { amount: { decrement: crypto } },
        });
        if (liq.count !== 1) throw new TradeRuleError("El anuncio ya no requiere ese monto");
      }

      const created = await tx.p2ptrade.create({
        data: {
          orderId: order.id,
          buyerId,
          sellerId,
          cryptoAmount: crypto,
          fiatAmount: fiat,
          price: order.price,
          status: "PENDING_PAYMENT",
          escrowHeld: true,
          escrowSource,
          escrowAmount,
          makerFee,
          makerId: order.userId,
        },
      });

      if (escrowSource === "WALLET") {
        const locked = await debit(tx, sellerId, escrowAmount, { type: "P2P_ESCROW", refId: created.id, note: "USDT bloqueados en escrow P2P" });
        if (!locked) throw new TradeRuleError("No tienes saldo suficiente para esta venta");
      }

      await systemMessage(
        tx,
        created.id,
        `Orden creada. ${crypto.toFixed(2)} USDT están asegurados en el Escrow de Roraima. El comprador debe pagar ${fiat.toFixed(2)} VES en 15 minutos. Pague SOLO desde una cuenta a su propio nombre y NO escriba "USDT" ni "cripto" en el concepto.`
      );

      // Si el anunciante configuró un mensaje de auto-respuesta para sus compradores/vendedores
      if (order.autoReply && order.autoReply.trim()) {
        await tx.p2pchatmessage.create({
          data: {
            tradeId: created.id,
            senderId: order.userId,
            content: `🤖 [Mensaje automático del comerciante]:\n${order.autoReply.trim()}`,
          },
        });
      }

      return created;
    }, serializable)
  );
}

export async function processTrade({
  idToken,
  orderId,
  fiatAmount,
  expectedPrice,
}: {
  idToken: string;
  orderId: string;
  /** Monto en VES que se pagará/recibirá. El servidor calcula los USDT. */
  fiatAmount: number;
  /** Precio que vio el usuario al confirmar (Compra rápida). Si cambió, se rechaza. */
  expectedPrice?: number;
}) {
  try {
    const user = await requireUser(idToken);
    await assertCanTrade(user);
    const trade = await openTrade(user, orderId, fiatAmount, expectedPrice);
    await publishTrade(trade.id, "TRADE_CREATED", user.id);
    return { success: true as const, tradeId: trade.id };
  } catch (error) {
    console.error("Error processing trade:", error);
    return { success: false as const, error: toClientError(error, "Error procesando la transacción") };
  }
}

/**
 * Modo Rápido: busca el mejor anuncio que admita el monto y abre la orden automáticamente.
 * side = "buy"  → el usuario compra USDT pagando `amount` VES (toma anuncios SELL al menor precio).
 * side = "sell" → el usuario vende `amount` USDT (toma anuncios BUY al mayor precio).
 */
export async function expressTrade({ idToken, side, amount }: { idToken: string; side: "buy" | "sell"; amount: number }) {
  try {
    const user = await requireUser(idToken);
    await assertCanTrade(user);
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new TradeRuleError("Monto inválido");
    const toFiat = (price: number) => (side === "buy" ? amount : Math.round(amount * price * 100) / 100);
    const ads = (await fetchP2POrders(side === "buy" ? "SELL" : "BUY")).filter((a) => {
      const fiat = toFiat(a.price);
      return a.user.id !== user.id && fiat >= a.minAmount && fiat <= a.maxAmount;
    });
    if (ads.length === 0) throw new TradeRuleError("No hay anuncios disponibles para ese monto en este momento. Prueba con otro monto o usa el mercado P2P.");
    let lastError: unknown = null;
    for (const ad of ads.slice(0, 3)) {
      try {
        const trade = await openTrade(user, ad.id, toFiat(ad.price));
        await publishTrade(trade.id, "TRADE_CREATED", user.id);
        return { success: true as const, tradeId: trade.id };
      } catch (e) {
        lastError = e;
        // Si el fallo es del usuario (saldo, límites propios), no tiene sentido probar otro anuncio
        if (e instanceof TradeRuleError && /Tienes|No tienes|Agrega|Cancelaste/.test(e.message)) throw e;
      }
    }
    throw lastError ?? new TradeRuleError("No se pudo abrir la orden");
  } catch (error) {
    console.error("Error express trade:", error);
    return { success: false as const, error: toClientError(error, "Error procesando la orden rápida") };
  }
}

/**
 * Cotización de Compra rápida (desde la mascota de la portada).
 * El usuario indica cuánto quiere comprar en Bs o en USDT; el servidor elige el anuncio
 * promocionado (VIP) que admita ese monto — o el mejor precio si ningún VIP lo admite —
 * y devuelve todos los detalles ANTES de abrir la orden. Al confirmar se usa `processTrade`,
 * que vuelve a aplicar todas las reglas (KYC, límites, lista negra, escrow, etc.).
 */
export async function getExpressBuyQuote({ idToken, amount, unit }: { idToken: string; amount: number; unit: "VES" | "USDT" }) {
  try {
    const user = await requireUser(idToken);
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new TradeRuleError("Monto inválido");
    if (unit !== "VES" && unit !== "USDT") throw new TradeRuleError("Moneda inválida");

    // ¿Puede operar? (no bloquea la cotización: se le explica qué le falta)
    let blocker: string | null = null;
    try {
      await assertCanTrade(user);
    } catch (e) {
      blocker = e instanceof Error ? e.message : "No puedes operar todavía";
    }

    const toFiat = (price: number) => (unit === "VES" ? Math.round(amount * 100) / 100 : Math.round(amount * price * 100) / 100);
    const ads = (await fetchP2POrders("SELL", idToken)).filter((a) => a.user.id !== user.id);
    if (ads.length === 0) throw new TradeRuleError("Ahora mismo no hay vendedores disponibles. Inténtalo en unos minutos.");
    const fits = ads.filter((a) => {
      const fiat = toFiat(a.price);
      return fiat >= a.minAmount && fiat <= a.maxAmount;
    });
    if (fits.length === 0) {
      const min = Math.min(...ads.map((a) => a.minAmount));
      const max = Math.max(...ads.map((a) => a.maxAmount));
      throw new TradeRuleError(`Ningún vendedor admite ese monto. El mercado acepta entre ${min.toFixed(2)} y ${max.toFixed(2)} Bs por orden.`);
    }

    const ad = fits[0]; // fetchP2POrders ya ordena: VIP primero, luego mejor precio
    const fiat = toFiat(ad.price);
    const crypto = round6(fiat / ad.price);
    if (crypto < MIN_TRADE_USDT) throw new TradeRuleError(`El monto mínimo por orden es ${MIN_TRADE_USDT} USDT`);
    const bestPrice = Math.min(...fits.map((a) => a.price));

    return {
      success: true as const,
      quote: {
        orderId: ad.id,
        price: ad.price,
        fiatAmount: fiat,
        cryptoAmount: crypto,
        bestPrice,
        methods: ad.methods,
        minAmount: ad.minAmount,
        maxAmount: ad.maxAmount,
        paymentWindowMin: PAYMENT_WINDOW_MS / 60000,
        takerFee: 0,
        seller: { id: ad.user.id, name: ad.user.name, rank: ad.user.rank, rankLabel: RANK_META[ad.user.rank].label, rankEmoji: RANK_META[ad.user.rank].emoji, vip: ad.user.vip, kycVerified: ad.user.kycStatus === "VERIFIED" },
        stats: ad.stats,
      },
      blocker,
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo calcular la compra") };
  }
}

export async function getTradeDetails(idToken: string, tradeId: string) {
  try {
    const user = await requireUser(idToken);
    const { trade: base, isBuyer, isSeller, isStaff } = await loadTradeForUser(tradeId, user);

    // Expiración aplicada por el SERVIDOR (no depende de que el navegador esté abierto)
    if (base.status === "PENDING_PAYMENT" && isExpired(base)) {
      const ok = await withRetry(() => prisma.$transaction((tx) => cancelAndRefund(tx, base.id, "tiempo de pago agotado", "TIMEOUT"), serializable));
      if (ok) await publishTrade(base.id, "CANCELLED");
    }

    const trade = await prisma.p2ptrade.findUnique({
      where: { id: tradeId },
      include: {
        p2porder: { select: { id: true, type: true, methods: true, price: true } },
        user_p2ptrade_buyerIdTouser: { select: { id: true, name: true, firstName: true, lastName: true, kycStatus: true } },
        user_p2ptrade_sellerIdTouser: { select: { id: true, name: true, firstName: true, lastName: true, kycStatus: true } },
        p2pchatmessage: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, role: true } } } },
        userfeedback: { select: { reviewerId: true } },
      },
    });
    if (!trade) return null;

    // Datos bancarios reales del vendedor: solo mientras la orden está activa
    const showBank = ["PENDING_PAYMENT", "PAID", "DISPUTED"].includes(trade.status);
    const sellerMethods = showBank
      ? await prisma.userpaymentmethod.findMany({ where: { userId: trade.sellerId }, orderBy: { createdAt: "desc" } })
      : [];
    // Titular y cédula SIEMPRE salen del KYC del vendedor (no de lo que escribió en el método)
    const sellerIdentity = showBank
      ? await prisma.user.findUnique({ where: { id: trade.sellerId }, select: { firstName: true, lastName: true, name: true, document: true } })
      : null;
    const sellerPaymentMethods = sellerMethods.map((m) => {
      let details: Record<string, string> = {};
      try {
        details = JSON.parse(m.details);
      } catch {
        /* datos corruptos: se ignoran */
      }
      const label = methodLabel(m);
      return {
        id: m.id,
        type: m.type,
        label,
        appealMinutes: appealCooldownMin(label),
        owner: sellerIdentity ? kycFullName(sellerIdentity) : details.owner ?? "",
        cedula: sellerIdentity?.document ?? details.cedula ?? "",
        bank: details.bank ?? "",
        account: details.account ?? "",
        phone: details.phone ?? "",
      };
    });

    const makerIsBuyer = trade.makerId === trade.buyerId;
    const now = Date.now();
    return {
      id: trade.id,
      status: trade.status,
      hasFeedback: trade.userfeedback.some((f) => f.reviewerId === user.id),
      buyerId: trade.buyerId,
      sellerId: trade.sellerId,
      cryptoAmount: trade.cryptoAmount,
      fiatAmount: trade.fiatAmount,
      price: trade.price,
      makerFee: trade.makerFee,
      buyerReceives: round6(makerIsBuyer ? trade.cryptoAmount - trade.makerFee : trade.cryptoAmount),
      createdAt: trade.createdAt.toISOString(),
      paidAt: trade.paidAt?.toISOString() ?? null,
      cancelledAt: trade.cancelledAt?.toISOString() ?? null,
      completedAt: trade.completedAt?.toISOString() ?? null,
      disputedAt: trade.disputedAt?.toISOString() ?? null,
      disputedBy: trade.disputedBy,
      disputeReason: trade.disputeReason,
      resolution: trade.resolution,
      resolutionNote: trade.resolutionNote,
      escrowHeld: trade.escrowHeld,
      // Reloj del servidor para que el contador no dependa de la hora del dispositivo
      serverNow: new Date(now).toISOString(),
      expiresAt: new Date(trade.createdAt.getTime() + PAYMENT_WINDOW_MS).toISOString(),
      paymentMethodUsed: trade.paymentMethod,
      appealCooldownMin: appealCooldownMin(trade.paymentMethod),
      appealAvailableAt: trade.paidAt ? new Date(trade.paidAt.getTime() + appealCooldownMs(trade.paymentMethod)).toISOString() : null,
      canAppealCancellation:
        trade.status === "CANCELLED" &&
        !trade.resolution &&
        !!trade.cancelledAt &&
        now - trade.cancelledAt.getTime() < CANCEL_APPEAL_WINDOW_MS,
      viewerRole: isBuyer ? "BUYER" : isSeller ? "SELLER" : isStaff ? "STAFF" : "NONE",
      order: trade.p2porder,
      sellerPaymentMethods,
      buyer: trade.user_p2ptrade_buyerIdTouser,
      seller: trade.user_p2ptrade_sellerIdTouser,
      messages: trade.p2pchatmessage.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        isSystem: m.senderId === SYSTEM_USER_ID,
        isStaff: isStaffRole(m.user.role),
        sender: { name: m.user.name },
      })),
      twoFactorEnabled: user.twoFactorEnabled,
    };
  } catch (error) {
    console.error("Error fetching trade:", error);
    return null;
  }
}

export async function cancelTrade(idToken: string, tradeId: string) {
  try {
    const user = await requireUser(idToken);
    const { trade, isBuyer, isSeller } = await loadTradeForUser(tradeId, user);
    if (!isBuyer && !isSeller) throw new TradeRuleError("Solo las partes pueden cancelar la orden");
    if (trade.status !== "PENDING_PAYMENT") throw new TradeRuleError("No se puede cancelar en este estado");

    const expired = isExpired(trade);
    // El vendedor NO puede cancelar mientras el comprador aún está en su ventana de pago
    if (isSeller && !expired) throw new TradeRuleError("Solo el comprador puede cancelar antes de que expire el tiempo");

    const reason = expired ? "tiempo de pago agotado" : "cancelada por el comprador";
    const ok = await withRetry(() =>
      prisma.$transaction((tx) => cancelAndRefund(tx, trade.id, reason, expired ? "TIMEOUT" : user.id), serializable)
    );
    if (!ok) throw new TradeRuleError("La orden cambió de estado. Recarga la página.");
    await publishTrade(trade.id, "CANCELLED", user.id);
    return { success: true as const };
  } catch (error) {
    console.error("Error cancelling trade:", error);
    return { success: false as const, error: toClientError(error, "Error al cancelar la orden") };
  }
}

export async function markTradeAsPaid(idToken: string, tradeId: string, paymentMethodId?: string) {
  try {
    const user = await requireUser(idToken);
    const { trade, isBuyer } = await loadTradeForUser(tradeId, user);
    if (!isBuyer) throw new TradeRuleError("Solo el comprador puede marcar la orden como pagada");
    if (trade.status !== "PENDING_PAYMENT") throw new TradeRuleError("La orden no está pendiente de pago");
    if (isExpired(trade)) throw new TradeRuleError("El tiempo de pago expiró. Si ya pagaste, usa el botón de apelación.");

    // El método debe ser uno de los del VENDEDOR (no se acepta texto libre del cliente). Siempre hay métodos:
    // no se puede abrir una orden contra un vendedor sin cuentas registradas.
    const sellerMethods = await prisma.userpaymentmethod.findMany({ where: { userId: trade.sellerId }, select: { id: true, type: true, details: true } });
    if (sellerMethods.length === 0) throw new TradeRuleError("El vendedor no tiene cuentas registradas. Contacta a soporte.");
    let chosen = paymentMethodId ? sellerMethods.find((m) => m.id === paymentMethodId) : undefined;
    if (paymentMethodId && !chosen) throw new TradeRuleError("Método de pago no válido para esta orden");
    if (!chosen && sellerMethods.length === 1) chosen = sellerMethods[0];
    if (!chosen) throw new TradeRuleError("Selecciona la cuenta del vendedor a la que transferiste");
    const usedMethod = methodLabel(chosen);
    const cooldown = appealCooldownMin(usedMethod);

    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const res = await tx.p2ptrade.updateMany({
          where: { id: trade.id, status: "PENDING_PAYMENT", createdAt: { gt: new Date(Date.now() - PAYMENT_WINDOW_MS) } },
          data: { status: "PAID", paidAt: new Date(), paymentMethod: usedMethod },
        });
        if (res.count !== 1) throw new TradeRuleError("La orden cambió de estado. Recarga la página.");
        await systemMessage(
          tx,
          trade.id,
          `El comprador indicó que realizó el pago${usedMethod ? ` por ${usedMethod}` : ""}. VENDEDOR: verifica en tu APP BANCARIA que el dinero esté acreditado y que el titular coincida con el comprador antes de liberar. Una captura de pantalla NO es prueba de pago. Si hay algún problema, cualquiera de las partes podrá apelar en ${cooldown} minutos.`
        );
      }, serializable)
    );
    await publishTrade(trade.id, "PAID", user.id);
    return { success: true as const };
  } catch (error) {
    console.error("Error marking trade as paid:", error);
    return { success: false as const, error: toClientError(error, "Error al actualizar la orden") };
  }
}

/** El vendedor confirma que recibió el dinero y libera el escrow al comprador. */
export async function releaseTrade(idToken: string, tradeId: string, twoFactorCode?: string) {
  try {
    const user = await requireUser(idToken);
    const { trade, isSeller } = await loadTradeForUser(tradeId, user);
    if (!isSeller) throw new TradeRuleError("Solo el vendedor puede liberar los fondos");
    if (trade.status !== "PAID") throw new TradeRuleError("Solo puedes liberar cuando el comprador haya marcado el pago");

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) throw new TradeRuleError("Se requiere código de autenticación 2FA");
      if (!user.twoFactorSecret) throw new TradeRuleError("Error de configuración 2FA");
      verifyTotpWithRateLimit(user.id, user.twoFactorSecret, twoFactorCode, user.email);
    }

    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const res = await tx.p2ptrade.updateMany({
          where: { id: trade.id, status: "PAID", escrowHeld: true },
          data: { status: "COMPLETED", completedAt: new Date(), escrowHeld: false },
        });
        if (res.count !== 1) throw new TradeRuleError("La orden cambió de estado. Recarga la página.");
        const received = await settleToBuyer(tx, trade);
        await systemMessage(tx, trade.id, `El vendedor liberó los fondos. El comprador recibió ${received.toFixed(2)} USDT. Orden completada con éxito.`);
      }, serializable)
    );
    await publishTrade(trade.id, "RELEASED", user.id);
    return { success: true as const };
  } catch (error) {
    console.error("Error releasing trade:", error);
    return { success: false as const, error: toClientError(error, "Error al liberar los fondos") };
  }
}

export async function disputeTrade(idToken: string, tradeId: string, reason: string) {
  try {
    const user = await requireUser(idToken);
    const { trade, isBuyer, isSeller } = await loadTradeForUser(tradeId, user);
    if (!isBuyer && !isSeller) throw new TradeRuleError("Solo las partes pueden abrir una disputa");

    const cleanReason = String(reason ?? "").trim().slice(0, 1000);
    if (cleanReason.length < 10) throw new TradeRuleError("Describe el motivo de la apelación (mínimo 10 caracteres)");

    const now = Date.now();
    const roleLabel = isBuyer ? "comprador" : "vendedor";

    if (trade.status === "PAID") {
      // Enfriamiento dinámico: da tiempo a que el pago se acredite según el método usado
      const cooldownMs = appealCooldownMs(trade.paymentMethod);
      if (trade.paidAt && now - trade.paidAt.getTime() < cooldownMs) {
        const mins = Math.ceil((cooldownMs - (now - trade.paidAt.getTime())) / 60000);
        throw new TradeRuleError(`Podrás apelar en ${mins} min. Los pagos por ${trade.paymentMethod ?? "este método"} pueden tardar en acreditarse.`);
      }
      await withRetry(() =>
        prisma.$transaction(async (tx) => {
          const res = await tx.p2ptrade.updateMany({
            where: { id: trade.id, status: "PAID" },
            data: { status: "DISPUTED", disputedAt: new Date(), disputedBy: user.id, disputeReason: cleanReason },
          });
          if (res.count !== 1) throw new TradeRuleError("La orden cambió de estado. Recarga la página.");
          await systemMessage(
            tx,
            trade.id,
            `El ${roleLabel} abrió una DISPUTA. Los fondos permanecen congelados en Escrow hasta que un mediador de Roraima resuelva. Suban todos los comprobantes en este chat.`
          );
        }, serializable)
      );
      await publishTrade(trade.id, "DISPUTED", user.id);
      return { success: true as const };
    }

    if (trade.status === "CANCELLED") {
      if (!isBuyer) throw new TradeRuleError("Solo el comprador puede apelar una cancelación");
      if (trade.resolution) throw new TradeRuleError("Esta orden ya fue resuelta por un mediador y no puede reabrirse");
      if (!trade.cancelledAt || now - trade.cancelledAt.getTime() >= CANCEL_APPEAL_WINDOW_MS) {
        throw new TradeRuleError("El plazo de 24h para apelar esta cancelación ha vencido. Contacta a soporte.");
      }

      await withRetry(() =>
        prisma.$transaction(async (tx) => {
          const res = await tx.p2ptrade.updateMany({
            where: { id: trade.id, status: "CANCELLED", resolution: null },
            data: { status: "DISPUTED", disputedAt: new Date(), disputedBy: user.id, disputeReason: cleanReason },
          });
          if (res.count !== 1) throw new TradeRuleError("La orden cambió de estado. Recarga la página.");

          // Re-congelar los fondos del vendedor mientras dure la mediación:
          // primero desde el anuncio (si sigue activo), si no, desde su billetera.
          const amount = round6(trade.escrowAmount > 0 ? trade.escrowAmount : trade.cryptoAmount);
          let source: "AD" | "WALLET" | null = null;
          const fromAd = await tx.p2porder.updateMany({
            where: { id: trade.orderId, userId: trade.sellerId, type: { startsWith: "SELL" }, status: { in: ["OPEN", "PAUSED"] }, amount: { gte: amount } },
            data: { amount: { decrement: amount } },
          });
          if (fromAd.count === 1) source = "AD";
          else if (await debit(tx, trade.sellerId, amount, { type: "P2P_ESCROW", refId: trade.id, note: "Re-congelado por apelación de cancelación" })) source = "WALLET";

          await tx.p2ptrade.update({
            where: { id: trade.id },
            data: source ? { escrowHeld: true, escrowSource: source, escrowAmount: amount } : { escrowHeld: false },
          });
          await systemMessage(
            tx,
            trade.id,
            source
              ? `El comprador APELÓ la cancelación. Se re-congelaron ${amount.toFixed(2)} USDT del vendedor hasta la resolución del mediador.`
              : "El comprador APELÓ la cancelación. ATENCIÓN: el vendedor no tiene saldo suficiente para re-congelar; el caso queda escalado a revisión prioritaria."
          );
        }, serializable)
      );
      await publishTrade(trade.id, "DISPUTED", user.id);
      return { success: true as const };
    }

    throw new TradeRuleError("No se puede apelar una orden en este estado");
  } catch (error) {
    console.error("Error disputing trade:", error);
    return { success: false as const, error: toClientError(error, "Error al abrir la disputa") };
  }
}

// ============================================================================
//  CHAT Y ADJUNTOS
// ============================================================================

export async function sendChatMessage(idToken: string, tradeId: string, content: string) {
  try {
    const user = await requireUser(idToken);
    await loadTradeForUser(tradeId, user);

    const text = String(content ?? "").trim();
    if (!text) throw new TradeRuleError("El mensaje está vacío");
    if (text.length > MAX_CHAT_LENGTH) throw new TradeRuleError(`Máximo ${MAX_CHAT_LENGTH} caracteres`);
    // Anti-suplantación: los usuarios no pueden imitar mensajes del sistema ni falsificar adjuntos
    if (/^\s*\[(SISTEMA|SYSTEM|ATTACHMENT|SOPORTE|ADMIN)/i.test(text)) {
      throw new TradeRuleError("Formato de mensaje no permitido");
    }

    const message = await prisma.p2pchatmessage.create({ data: { tradeId, senderId: user.id, content: text } });
    await publishTrade(tradeId, "MESSAGE", user.id);
    return { success: true as const, message: { id: message.id } };
  } catch (error) {
    console.error("Error sending chat message:", error);
    return { success: false as const, error: toClientError(error, "No se pudo enviar el mensaje") };
  }
}

/** Detecta el tipo REAL del archivo por sus bytes mágicos (no confiar en la extensión). */
function sniffFileType(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return { ext: "pdf", mime: "application/pdf" };
  return null;
}

export async function uploadAttachment(formData: FormData) {
  try {
    const user = await requireUser(formData.get("idToken") as string);
    const tradeId = String(formData.get("tradeId") ?? "");
    await loadTradeForUser(tradeId, user);

    const file = formData.get("file");
    if (!(file instanceof File)) throw new TradeRuleError("No se recibió archivo");
    if (file.size === 0) throw new TradeRuleError("El archivo está vacío");
    if (file.size > MAX_UPLOAD_BYTES) throw new TradeRuleError("El archivo supera el límite de 5 MB");

    const buffer = Buffer.from(await file.arrayBuffer());
    const kind = sniffFileType(buffer);
    if (!kind) throw new TradeRuleError("Solo se permiten imágenes (PNG, JPG, WEBP) o PDF");

    const fs = await import("fs/promises");
    const path = await import("path");
    const crypto = await import("crypto");

    const uploadDir = path.join(process.cwd(), "public", "uploads", "p2p");
    await fs.mkdir(uploadDir, { recursive: true });
    // Nombre aleatorio no adivinable + extensión según el contenido real
    const filename = `${crypto.randomUUID()}.${kind.ext}`;
    await fs.writeFile(path.join(uploadDir, filename), buffer);

    const displayName = (file.name || `comprobante.${kind.ext}`).replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, "_").slice(0, 80);
    const url = `/uploads/p2p/${filename}`;
    await prisma.p2pchatmessage.create({ data: { tradeId, senderId: user.id, content: `[ATTACHMENT:${url}:${displayName}]` } });
    await publishTrade(tradeId, "MESSAGE", user.id);

    return { success: true as const, url };
  } catch (error) {
    console.error("Error uploading file:", error);
    return { success: false as const, error: toClientError(error, "Error al guardar el archivo en el servidor") };
  }
}

// ============================================================================
//  MÉTODOS DE PAGO
// ============================================================================

const PAYMENT_TYPES = ["Pago Movil", "Transferencia Bancaria"] as const;
const VE_MOBILE_RE = /^04(12|14|16|22|24|26)\d{7}$/;

/**
 * Registrar una cuenta para RECIBIR bolívares. Regla de la casa: la cuenta debe estar a nombre
 * del titular verificado por KYC. Titular y cédula los pone el SERVIDOR desde el KYC; si el
 * cliente envía otra cédula, se rechaza.
 */
export async function addPaymentMethod(idToken: string, data: { type: string; details: string }) {
  try {
    const user = await requireUser(idToken);
    if (user.kycStatus !== "VERIFIED") {
      throw new TradeRuleError("Primero completa tu verificación KYC. Las cuentas deben estar a nombre del titular verificado.");
    }
    const type = String(data.type ?? "").trim() as (typeof PAYMENT_TYPES)[number];
    if (!PAYMENT_TYPES.includes(type)) throw new TradeRuleError("Tipo de método inválido");

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(String(data.details ?? "").slice(0, 4000));
    } catch {
      throw new TradeRuleError("Formato de datos inválido");
    }
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const bank = str(raw.bank, 80);
    if (!bank) throw new TradeRuleError("Selecciona el banco");

    // La cédula de la cuenta debe ser la misma del KYC (si la envían distinta, se rechaza)
    const kycDoc = docDigits(user.document);
    const sentDoc = docDigits(str(raw.cedula, 20));
    if (sentDoc && sentDoc !== kycDoc) {
      throw new TradeRuleError(`La cédula de la cuenta (${sentDoc}) no coincide con tu cédula verificada (${kycDoc}). Solo puedes registrar cuentas a tu nombre.`);
    }

    const details: Record<string, string> = { owner: kycFullName(user), cedula: user.document ?? "", bank };
    if (type === "Pago Movil") {
      const phone = str(raw.phone, 20).replace(/\D/g, "");
      if (!VE_MOBILE_RE.test(phone)) throw new TradeRuleError("Teléfono de Pago Móvil inválido (ej. 0414-1234567)");
      details.phone = `${phone.slice(0, 4)}-${phone.slice(4)}`;
    } else {
      const account = str(raw.account, 30).replace(/\D/g, "");
      if (!/^\d{20}$/.test(account)) throw new TradeRuleError("El número de cuenta debe tener 20 dígitos");
      const bankCode = bank.match(/^(\d{4})/)?.[1];
      if (bankCode && !account.startsWith(bankCode)) throw new TradeRuleError(`La cuenta no pertenece al banco seleccionado (debe empezar por ${bankCode})`);
      details.account = account;
    }

    const existing = await prisma.userpaymentmethod.findMany({ where: { userId: user.id }, select: { type: true, details: true } });
    if (existing.length >= 20) throw new TradeRuleError("Máximo 20 métodos de pago por cuenta");
    const dup = existing.some((m) => {
      try {
        const d = JSON.parse(m.details) as Record<string, string>;
        return m.type === type && d.bank === bank && (d.phone ?? "").replace(/\D/g, "") === (details.phone ?? "").replace(/\D/g, "") && (d.account ?? "") === (details.account ?? "");
      } catch {
        return false;
      }
    });
    if (dup) throw new TradeRuleError("Ya registraste esta cuenta");

    const method = await prisma.userpaymentmethod.create({ data: { userId: user.id, type, details: JSON.stringify(details) } });
    return { success: true as const, method };
  } catch (error) {
    console.error("Error adding payment method:", error);
    return { success: false as const, error: toClientError(error, "No se pudo guardar el método de pago") };
  }
}

export async function getPaymentMethods(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const rows = await prisma.userpaymentmethod.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    const kycDoc = docDigits(user.document);
    // Cuentas antiguas registradas con otra cédula quedan señaladas para que el usuario las reemplace
    return rows.map((m) => {
      let cedula = "";
      try {
        cedula = (JSON.parse(m.details) as { cedula?: string }).cedula ?? "";
      } catch {
        /* datos corruptos */
      }
      return { ...m, kycMatch: Boolean(kycDoc) && docDigits(cedula) === kycDoc };
    });
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    return [];
  }
}

/** Titular verificado que se usará en las cuentas (para mostrarlo en el formulario). */
export async function getPaymentIdentity(idToken: string) {
  try {
    const user = await requireUser(idToken);
    return { success: true as const, verified: user.kycStatus === "VERIFIED", kycStatus: user.kycStatus, owner: kycFullName(user), cedula: user.document ?? "" };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo cargar tu identidad") };
  }
}

export async function deletePaymentMethod(idToken: string, methodId: string) {
  try {
    const user = await requireUser(idToken);
    // No se puede borrar un método mientras haya órdenes de venta activas (el comprador lo está usando)
    const activeSales = await prisma.p2ptrade.count({ where: { sellerId: user.id, status: { in: ACTIVE_STATUSES } } });
    if (activeSales > 0) throw new TradeRuleError("Tienes órdenes de venta activas. Finalízalas antes de eliminar métodos de pago.");
    // Con anuncios de venta publicados siempre debe quedar al menos una cuenta donde recibir
    const [count, sellAds] = await Promise.all([
      prisma.userpaymentmethod.count({ where: { userId: user.id } }),
      prisma.p2porder.count({ where: { userId: user.id, type: { startsWith: "SELL" }, status: { in: ["OPEN", "PAUSED"] } } }),
    ]);
    if (count <= 1 && sellAds > 0) throw new TradeRuleError("Es tu única cuenta y tienes anuncios de venta publicados. Agrega otra cuenta o cierra tus anuncios primero.");
    const res = await prisma.userpaymentmethod.deleteMany({ where: { id: methodId, userId: user.id } });
    if (res.count !== 1) throw new TradeRuleError("Método de pago no encontrado");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo eliminar el método de pago") };
  }
}

// ============================================================================
//  ANUNCIOS (los anuncios de venta CONGELAN los USDT al publicarse, como en Binance)
// ============================================================================

type AdInput = { type: string; amount: number; price: number; minAmount: number; maxAmount: number; methods: string; requiresVerification?: boolean; autoReply?: string };

function validateAdNumbers(d: { amount: number; price: number; minAmount: number; maxAmount: number }) {
  const nums = [d.amount, d.price, d.minAmount, d.maxAmount];
  if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0)) {
    throw new TradeRuleError("Los montos deben ser números positivos");
  }
  if (d.minAmount > d.maxAmount) throw new TradeRuleError("El límite mínimo no puede ser mayor que el máximo");
  if (d.minAmount < d.price * MIN_TRADE_USDT) {
    throw new TradeRuleError(`El límite mínimo debe equivaler al menos a ${MIN_TRADE_USDT} USDT (${(d.price * MIN_TRADE_USDT).toFixed(2)} VES)`);
  }
  const totalVes = d.amount * d.price;
  if (d.minAmount > totalVes) throw new TradeRuleError(`El límite mínimo supera el total del anuncio (${totalVes.toFixed(2)} VES)`);
}

export async function createP2POrder(idToken: string, data: AdInput) {
  try {
    const user = await requireUser(idToken);
    assertProfileComplete(user);
    if (user.kycStatus !== "VERIFIED") {
      throw new TradeRuleError("Debes completar y aprobar tu verificación KYC para publicar anuncios");
    }

    const type = String(data.type ?? "");
    if (!/^(BUY|SELL)(_[A-Z]+)?$/.test(type)) throw new TradeRuleError("Tipo de anuncio inválido");
    validateAdNumbers(data);
    const methods = String(data.methods ?? "").split(",").map((m) => m.trim()).filter(Boolean).slice(0, 5).join(",");
    if (!methods) throw new TradeRuleError("Selecciona al menos un método de pago");

    const sell = isSellAd(type);
    if (sell) {
      const pm = await prisma.userpaymentmethod.count({ where: { userId: user.id } });
      if (pm === 0) throw new TradeRuleError("Agrega al menos un método de pago donde recibir los bolívares antes de publicar un anuncio de venta");
    }

    const amount = round6(data.amount);
    const order = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const created = await tx.p2porder.create({
          data: { 
            userId: user.id, 
            type, 
            amount, 
            price: data.price, 
            minAmount: data.minAmount, 
            maxAmount: data.maxAmount, 
            methods: methods.slice(0, 255), 
            status: "OPEN",
            requiresVerification: !!data.requiresVerification,
            autoReply: data.autoReply ? String(data.autoReply).trim().slice(0, 1000) : null,
          },
        });
        if (sell) {
          // Congelar los USDT del anuncio: no podrán gastarse en otra cosa mientras esté publicado
          const ok = await debit(tx, user.id, amount, { type: "AD_FREEZE", refId: created.id, note: "USDT congelados en anuncio de venta" });
          if (!ok) {
            const w = await tx.wallet.findFirst({ where: { userId: user.id, currency: "USDT" } });
            throw new TradeRuleError(`Saldo insuficiente. Disponible: ${(w?.balance ?? 0).toFixed(2)} USDT`);
          }
        }
        return created;
      }, serializable)
    );

    // Notificar a los seguidores que tengan alertas activadas
    try {
      const followers = await prisma.userfollow.findMany({
        where: { followingId: user.id, notifyOnAd: true },
        select: { followerId: true },
      });
      if (followers.length > 0) {
        const merchantName = publicName(user);
        const actionLabel = type === "SELL" ? "venta" : "compra";
        await prisma.usernotification.createMany({
          data: followers.map((f) => ({
            userId: f.followerId,
            title: `Nuevo anuncio P2P de ${merchantName}`,
            body: `${merchantName} publicó un anuncio de ${actionLabel} de USDT a ${data.price} VES.`,
            kind: "P2P_AD",
            href: `/dashboard/p2p/user/${user.id}`,
          })),
        });
      }
    } catch (notifErr) {
      console.error("Error creating follower notifications:", notifErr);
    }

    return { success: true as const, orderId: order.id };
  } catch (error) {
    console.error("Error creating P2P order:", error);
    return { success: false as const, error: toClientError(error, "Error interno al crear el anuncio") };
  }
}

/** Pausar / reanudar / cerrar un anuncio. Al cerrar un anuncio de venta se devuelven los USDT restantes. */
export async function updateAdStatus(idToken: string, orderId: string, action: "PAUSE" | "RESUME" | "CLOSE") {
  try {
    const user = await requireUser(idToken);
    if (!["PAUSE", "RESUME", "CLOSE"].includes(action)) throw new TradeRuleError("Acción inválida");

    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const order = await tx.p2porder.findUnique({ where: { id: orderId } });
        if (!order || order.userId !== user.id) throw new TradeRuleError("Anuncio no encontrado");

        if (action === "PAUSE") {
          const r = await tx.p2porder.updateMany({ where: { id: order.id, status: "OPEN" }, data: { status: "PAUSED" } });
          if (r.count !== 1) throw new TradeRuleError("Solo puedes pausar anuncios activos");
          return;
        }
        if (action === "RESUME") {
          if (user.kycStatus !== "VERIFIED") throw new TradeRuleError("Tu verificación KYC no está aprobada");
          const r = await tx.p2porder.updateMany({ where: { id: order.id, status: "PAUSED" }, data: { status: "OPEN" } });
          if (r.count !== 1) throw new TradeRuleError("Solo puedes reanudar anuncios pausados");
          return;
        }
        // CLOSE: transición condicional para no devolver dos veces
        const r = await tx.p2porder.updateMany({
          where: { id: order.id, status: { in: ["OPEN", "PAUSED"] } },
          data: { status: "CLOSED", amount: 0 },
        });
        if (r.count !== 1) throw new TradeRuleError("El anuncio ya está cerrado");
        if (isSellAd(order.type) && order.amount > 0) {
          const frozen = await tx.wallettx.count({ where: { refId: order.id, type: "AD_FREEZE" } });
          if (frozen > 0) {
            await credit(tx, user.id, order.amount, { type: "AD_UNFREEZE", refId: order.id, note: "Devolución de USDT al cerrar anuncio" });
          }
        }
      }, serializable)
    );
    return { success: true as const };
  } catch (error) {
    console.error("Error updating ad status:", error);
    return { success: false as const, error: toClientError(error, "No se pudo actualizar el anuncio") };
  }
}

/** Editar precio, límites y métodos de un anuncio activo o pausado. */
export async function updateAd(idToken: string, orderId: string, data: { price: number; minAmount: number; maxAmount: number; methods: string }) {
  try {
    const user = await requireUser(idToken);
    const order = await prisma.p2porder.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== user.id) throw new TradeRuleError("Anuncio no encontrado");
    if (!["OPEN", "PAUSED"].includes(order.status)) throw new TradeRuleError("No puedes editar un anuncio cerrado");
    validateAdNumbers({ amount: order.amount, price: data.price, minAmount: data.minAmount, maxAmount: data.maxAmount });
    const methods = String(data.methods ?? "").split(",").map((m) => m.trim()).filter(Boolean).slice(0, 5).join(",");
    if (!methods) throw new TradeRuleError("Selecciona al menos un método de pago");
    await prisma.p2porder.updateMany({
      where: { id: order.id, status: { in: ["OPEN", "PAUSED"] } },
      data: { price: data.price, minAmount: data.minAmount, maxAmount: data.maxAmount, methods: methods.slice(0, 255) },
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo editar el anuncio") };
  }
}

export async function fetchMyP2POrders(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const orders = await prisma.p2porder.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    const ids = orders.map((o) => o.id);
    const trades = ids.length
      ? await prisma.p2ptrade.findMany({ where: { orderId: { in: ids } }, select: { orderId: true, status: true, cryptoAmount: true } })
      : [];
    return orders.map((o) => {
      const mine = trades.filter((t) => t.orderId === o.id);
      return {
        ...o,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        completedQty: round6(mine.filter((t) => t.status === "COMPLETED").reduce((s, t) => s + t.cryptoAmount, 0)),
        completedCount: mine.filter((t) => t.status === "COMPLETED").length,
        activeTrades: mine.filter((t) => ACTIVE_STATUSES.includes(t.status)).length,
      };
    });
  } catch (error) {
    console.error("Error fetching my orders:", error);
    return [];
  }
}

/** Órdenes activas/recientes del usuario (para que nunca "pierda" una sala de trade). */
export async function fetchMyTrades(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const trades = await prisma.p2ptrade.findMany({
      where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, status: true, cryptoAmount: true, fiatAmount: true, price: true, buyerId: true, createdAt: true },
    });
    return trades.map((t) => ({ ...t, side: t.buyerId === user.id ? "BUY" : "SELL", createdAt: t.createdAt.toISOString() }));
  } catch (error) {
    console.error("Error fetching my trades:", error);
    return [];
  }
}

/** Centro de usuario P2P: estadísticas reales del perfil de comerciante. */
export async function getUserCenter(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const [rep, all, methods, ads, comments, blocks] = await Promise.all([
      reputationFor([user.id]),
      prisma.p2ptrade.findMany({
        where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
        select: { buyerId: true, status: true, cryptoAmount: true, fiatAmount: true, completedAt: true, createdAt: true },
      }),
      prisma.userpaymentmethod.count({ where: { userId: user.id } }),
      prisma.p2porder.count({ where: { userId: user.id, status: { in: ["OPEN", "PAUSED"] } } }),
      prisma.userfeedback.findMany({
        where: { reviewedId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, rating: true, comment: true, createdAt: true, tradeId: true, reviewer: { select: { name: true, firstName: true, lastName: true } } },
      }),
      prisma.userblock.findMany({
        where: { blockerId: user.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, blocked: { select: { id: true, name: true, firstName: true, lastName: true } } },
      }),
    ]);
    const completed = all.filter((t) => t.status === "COMPLETED");
    const firstTrade = completed.reduce<Date | null>((min, t) => (!min || t.createdAt < min ? t.createdAt : min), null);
    const stats = rep[user.id] ?? EMPTY_REP;
    const rank = computeRank(stats.totalCompleted, stats.completionRate, stats.feedbackScore);
    return {
      success: true as const,
      profile: {
        name: publicName(user),
        email: user.email,
        kycStatus: user.kycStatus,
        vipUntil: user.vipUntil ? user.vipUntil.toISOString() : null,
        memberSince: user.createdAt.toISOString(),
        firstTradeAt: firstTrade?.toISOString() ?? null,
        rank,
        rankMeta: RANK_META[rank],
        ...stats,
        totalTrades: all.length,
        buyCount: completed.filter((t) => t.buyerId === user.id).length,
        sellCount: completed.filter((t) => t.buyerId !== user.id).length,
        buyVolume: round6(completed.filter((t) => t.buyerId === user.id).reduce((s, t) => s + t.cryptoAmount, 0)),
        sellVolume: round6(completed.filter((t) => t.buyerId !== user.id).reduce((s, t) => s + t.cryptoAmount, 0)),
        activeTrades: all.filter((t) => ACTIVE_STATUSES.includes(t.status)).length,
        disputes: all.filter((t) => t.status === "DISPUTED").length,
        paymentMethods: methods,
        activeAds: ads,
        nextRank: rankProgress(rank, stats.totalCompleted, stats.completionRate, stats.feedbackScore),
        comments: comments.map((c) => ({
          id: c.id,
          rating: c.rating,
          comment: c.comment,
          date: c.createdAt.toISOString(),
          tradeId: c.tradeId,
          reviewer: maskName(publicName(c.reviewer)),
        })),
        blockedUsers: blocks.map((b) => ({ id: b.blocked.id, name: publicName(b.blocked), blockedAt: b.createdAt.toISOString() })),
      },
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo cargar el centro de usuario") };
  }
}

// ============================================================================
//  PERFIL PÚBLICO P2P (cualquier usuario puede ver el de otro)
// ============================================================================

export async function getPublicP2PProfile(idToken: string, targetUserId: string) {
  try {
    const caller = await requireUser(idToken); // Autenticado
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true, name: true, firstName: true, lastName: true, email: true,
        kycStatus: true, createdAt: true, phone: true, address: true,
      },
    });
    if (!target) return { success: false as const, error: "Usuario no encontrado" };

    const [rep, allTrades, buyAds, sellAds, methods, followRel, followersCount] = await Promise.all([
      reputationFor([target.id]),
      prisma.p2ptrade.findMany({
        where: { OR: [{ buyerId: target.id }, { sellerId: target.id }] },
        select: { buyerId: true, sellerId: true, status: true, cryptoAmount: true, fiatAmount: true, price: true, completedAt: true, createdAt: true },
      }),
      prisma.p2porder.findMany({
        where: { userId: target.id, type: { startsWith: "BUY" }, status: "OPEN", amount: { gt: 0 } },
        select: { id: true, type: true, price: true, amount: true, minAmount: true, maxAmount: true, methods: true },
        orderBy: { price: "desc" },
        take: 20,
      }),
      prisma.p2porder.findMany({
        where: { userId: target.id, type: { startsWith: "SELL" }, status: "OPEN", amount: { gt: 0 } },
        select: { id: true, type: true, price: true, amount: true, minAmount: true, maxAmount: true, methods: true },
        orderBy: { price: "asc" },
        take: 20,
      }),
      prisma.userpaymentmethod.findMany({
        where: { userId: target.id },
        select: { type: true },
      }),
      prisma.userfollow.findUnique({
        where: { followerId_followingId: { followerId: caller.id, followingId: target.id } },
      }),
      prisma.userfollow.count({
        where: { followingId: target.id },
      }),
    ]);

    const stats = rep[target.id] ?? EMPTY_REP;
    const rank = computeRank(stats.totalCompleted, stats.completionRate, stats.feedbackScore);
    const completed = allTrades.filter((t) => t.status === "COMPLETED");
    const firstTrade = completed.reduce<Date | null>((min, t) => (!min || t.createdAt < min ? t.createdAt : min), null);

    const verified = {
      email: true,
      id: target.kycStatus === "VERIFIED",
      phone: Boolean(target.phone),
      address: Boolean(target.address),
    };

    return {
      success: true as const,
      profile: {
        id: target.id,
        name: publicName(target),
        isSelf: caller.id === target.id,
        isFollowing: Boolean(followRel),
        notifyOnAd: followRel?.notifyOnAd ?? false,
        followersCount,
        rank,
        rankMeta: RANK_META[rank],
        kycStatus: target.kycStatus,
        memberSince: target.createdAt.toISOString(),
        firstTradeAt: firstTrade?.toISOString() ?? null,
        verified,
        ...stats,
        totalTrades: allTrades.length,
        buyCount: completed.filter((t) => t.buyerId === target.id).length,
        sellCount: completed.filter((t) => t.sellerId === target.id).length,
        buyVolume: round6(completed.filter((t) => t.buyerId === target.id).reduce((s, t) => s + t.cryptoAmount, 0)),
        sellVolume: round6(completed.filter((t) => t.sellerId === target.id).reduce((s, t) => s + t.cryptoAmount, 0)),
        paymentMethods: methods.map((m) => m.type),
        buyAds: buyAds.map((a) => ({
          id: a.id,
          price: a.price,
          available: round6(a.amount),
          minAmount: Math.round(a.minAmount * 100) / 100,
          maxAmount: Math.round((a.maxAmount > 0 ? Math.min(a.maxAmount, a.amount * a.price) : a.amount * a.price) * 100) / 100,
          methods: a.methods,
        })),
        sellAds: sellAds.map((a) => {
          const usable = a.amount / (1 + MAKER_FEE_RATE);
          const maxVes = a.maxAmount > 0 ? Math.min(a.maxAmount, usable * a.price) : usable * a.price;
          return {
            id: a.id,
            price: a.price,
            available: round6(usable),
            minAmount: Math.round(Math.max(a.minAmount, MIN_TRADE_USDT * a.price) * 100) / 100,
            maxAmount: Math.round(maxVes * 100) / 100,
            methods: a.methods,
          };
        }),
      },
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo cargar el perfil") };
  }
}
