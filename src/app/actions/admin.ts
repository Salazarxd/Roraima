"use server";

import prisma from "@/lib/prisma";
import { requireAdmin, requireStaff, toClientError } from "@/lib/server-auth";
import { refundEscrow, serializable, settleToBuyer, systemMessage, SYSTEM_USER_ID, TradeRuleError } from "@/lib/ledger";
import { publishTrade } from "@/lib/realtime";
import type { SystemSettings } from "@/lib/settings";

/**
 * RBAC de Roraima:
 *  - ADMIN:   todo. Ejecuta decisiones, aprueba/rechaza propuestas, gestiona retiros y equipo.
 *  - SUPPORT: atiende tickets, revisa disputas y KYC, escribe como mediador y PROPONE decisiones.
 *             Ninguna propuesta mueve fondos ni cambia estados hasta que un ADMIN la aprueba.
 */

const displayName = (u: { name: string | null; firstName: string | null; lastName: string | null; email?: string }) =>
  u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Usuario";

type DisputeDecision = "RELEASE_TO_BUYER" | "REFUND_TO_SELLER";
type KycDecision = "VERIFIED" | "REJECTED";

const DECISION_LABEL: Record<string, string> = {
  RELEASE_TO_BUYER: "Liberar USDT al comprador",
  REFUND_TO_SELLER: "Devolver USDT al vendedor",
  VERIFIED: "Aprobar KYC",
  REJECTED: "Rechazar KYC",
};

// ============================================================================
//  SESIÓN / RBAC
// ============================================================================

export async function getStaffSession(idToken: string) {
  try {
    const staff = await requireStaff(idToken);
    return {
      success: true as const,
      staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role as "ADMIN" | "SUPPORT" },
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Acceso denegado") };
  }
}

// ============================================================================
//  MÉTRICAS (solo ADMIN)
// ============================================================================

export async function getAdminStats(idToken: string) {
  try {
    await requireAdmin(idToken);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [users, pendingKyc, disputes, activeTrades, completedAgg, weekTrades, feeAgg, pendingWithdrawals, openTickets, pendingProposals] = await Promise.all([
      prisma.user.count({ where: { role: { not: "SYSTEM" } } }),
      prisma.user.count({ where: { kycStatus: "PENDING" } }),
      prisma.p2ptrade.count({ where: { status: "DISPUTED" } }),
      prisma.p2ptrade.count({ where: { status: { in: ["PENDING_PAYMENT", "PAID"] } } }),
      prisma.p2ptrade.aggregate({ where: { status: "COMPLETED" }, _sum: { cryptoAmount: true }, _count: true }),
      prisma.p2ptrade.findMany({ where: { status: "COMPLETED", completedAt: { gte: since } }, select: { cryptoAmount: true, completedAt: true } }),
      prisma.platformfee.aggregate({ _sum: { amount: true } }),
      prisma.withdrawal.count({ where: { status: "PENDING" } }),
      prisma.supportticket.count({ where: { status: { not: "CLOSED" } } }),
      prisma.staffaction.count({ where: { status: "PENDING" } }),
    ]);

    // Volumen diario de los últimos 7 días
    const daily: { label: string; volume: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const volume = weekTrades
        .filter((t) => t.completedAt && t.completedAt >= d && t.completedAt < next)
        .reduce((s, t) => s + t.cryptoAmount, 0);
      daily.push({ label: d.toLocaleDateString("es-VE", { weekday: "short" }), volume });
    }

    return {
      success: true as const,
      stats: {
        users,
        pendingKyc,
        disputes,
        activeTrades,
        completedTrades: completedAgg._count,
        completedVolume: completedAgg._sum.cryptoAmount ?? 0,
        feeRevenue: feeAgg._sum.amount ?? 0,
        pendingWithdrawals,
        openTickets,
        pendingProposals,
        daily,
      },
    };
  } catch (error) {
    console.error("Error admin stats:", error);
    return { success: false as const, error: toClientError(error, "No se pudieron cargar las métricas") };
  }
}

/** Propuesta pendiente (si existe) por objetivo, para mostrarla en las colas. */
async function pendingProposalsFor(targetIds: string[]) {
  if (targetIds.length === 0) return new Map<string, { id: string; decision: string; note: string; proposer: string; createdAt: string }>();
  const rows = await prisma.staffaction.findMany({
    where: { targetId: { in: targetIds }, status: "PENDING" },
    include: { proposer: { select: { name: true, email: true, firstName: true, lastName: true } } },
  });
  return new Map(
    rows.map((r) => [r.targetId, { id: r.id, decision: r.decision, note: r.note, proposer: displayName(r.proposer), createdAt: r.createdAt.toISOString() }])
  );
}

// ============================================================================
//  TRIBUNAL DE DISPUTAS (lectura: staff · ejecución: ADMIN)
// ============================================================================

export async function getDisputedTrades(idToken: string) {
  try {
    await requireStaff(idToken);
    const trades = await prisma.p2ptrade.findMany({
      where: { status: "DISPUTED" },
      orderBy: { disputedAt: "asc" }, // Los más antiguos primero (FIFO)
      include: {
        user_p2ptrade_buyerIdTouser: { select: { id: true, name: true, firstName: true, lastName: true, email: true, kycStatus: true, createdAt: true } },
        user_p2ptrade_sellerIdTouser: { select: { id: true, name: true, firstName: true, lastName: true, email: true, kycStatus: true, createdAt: true } },
      },
    });

    // Historial de reputación de cada parte (señales de fraude)
    const reputation = async (userId: string) => {
      const [completed, disputes, cancelled] = await Promise.all([
        prisma.p2ptrade.count({ where: { status: "COMPLETED", OR: [{ buyerId: userId }, { sellerId: userId }] } }),
        prisma.p2ptrade.count({ where: { disputedBy: { not: null }, OR: [{ buyerId: userId }, { sellerId: userId }] } }),
        prisma.p2ptrade.count({ where: { status: "CANCELLED", buyerId: userId } }),
      ]);
      return { completed, disputes, cancelled };
    };

    const proposals = await pendingProposalsFor(trades.map((t) => t.id));

    const result = await Promise.all(
      trades.map(async (t) => {
        const b = t.user_p2ptrade_buyerIdTouser;
        const s = t.user_p2ptrade_sellerIdTouser;
        const [buyerRep, sellerRep] = await Promise.all([reputation(b.id), reputation(s.id)]);
        return {
          id: t.id,
          cryptoAmount: t.cryptoAmount,
          fiatAmount: t.fiatAmount,
          price: t.price,
          createdAt: t.createdAt.toISOString(),
          paidAt: t.paidAt?.toISOString() ?? null,
          cancelledAt: t.cancelledAt?.toISOString() ?? null,
          disputedAt: t.disputedAt?.toISOString() ?? null,
          disputeReason: t.disputeReason,
          disputedByRole: t.disputedBy === t.buyerId ? "BUYER" : t.disputedBy === t.sellerId ? "SELLER" : null,
          escrowHeld: t.escrowHeld,
          wasCancelled: !!t.cancelledAt,
          pendingProposal: proposals.get(t.id) ?? null,
          buyer: { id: b.id, name: displayName(b), email: b.email, kycStatus: b.kycStatus, memberSince: b.createdAt.toISOString(), ...buyerRep },
          seller: { id: s.id, name: displayName(s), email: s.email, kycStatus: s.kycStatus, memberSince: s.createdAt.toISOString(), ...sellerRep },
        };
      })
    );
    return { success: true as const, trades: result };
  } catch (error) {
    console.error("Error disputed trades:", error);
    return { success: false as const, error: toClientError(error, "No se pudieron cargar las disputas"), trades: [] };
  }
}

export async function getDisputeMessages(idToken: string, tradeId: string) {
  try {
    await requireStaff(idToken);
    const trade = await prisma.p2ptrade.findUnique({ where: { id: tradeId }, select: { buyerId: true, sellerId: true } });
    if (!trade) throw new TradeRuleError("Orden no encontrada");
    const messages = await prisma.p2pchatmessage.findMany({
      where: { tradeId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, role: true } } },
    });
    return {
      success: true as const,
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        senderName: m.user.name ?? "Usuario",
        senderRole:
          m.senderId === SYSTEM_USER_ID ? "SYSTEM" :
          m.senderId === trade.buyerId ? "BUYER" :
          m.senderId === trade.sellerId ? "SELLER" :
          ["ADMIN", "SUPPORT"].includes(m.user.role) ? "STAFF" : "OTHER",
      })),
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo cargar el expediente"), messages: [] };
  }
}

/** Mensaje del mediador en el chat de la orden (visible para ambas partes). */
export async function sendMediatorMessage(idToken: string, tradeId: string, content: string) {
  try {
    const staff = await requireStaff(idToken);
    const text = String(content ?? "").trim().slice(0, 2000);
    if (!text) throw new TradeRuleError("Mensaje vacío");
    const trade = await prisma.p2ptrade.findUnique({ where: { id: tradeId }, select: { id: true, buyerId: true, sellerId: true } });
    if (!trade) throw new TradeRuleError("Orden no encontrada");
    if (trade.buyerId === staff.id || trade.sellerId === staff.id) throw new TradeRuleError("Conflicto de interés: participas en esta orden");
    await prisma.p2pchatmessage.create({ data: { tradeId, senderId: staff.id, content: text } });
    await publishTrade(tradeId, "MESSAGE", staff.id);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo enviar el mensaje") };
  }
}

/**
 * Ejecuta el veredicto. La transición DISPUTED → (COMPLETED|CANCELLED) es condicional:
 * dos administradores pulsando a la vez no pueden pagar dos veces.
 */
async function executeDisputeResolution(adminId: string, tradeId: string, decision: DisputeDecision, note: string) {
  if (decision !== "RELEASE_TO_BUYER" && decision !== "REFUND_TO_SELLER") throw new TradeRuleError("Decisión inválida");
  const trade = await prisma.p2ptrade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new TradeRuleError("Orden no encontrada");
  // Conflicto de interés: nadie resuelve una orden en la que participa
  if (trade.buyerId === adminId || trade.sellerId === adminId) {
    throw new TradeRuleError("Conflicto de interés: no puedes resolver una orden en la que participas");
  }
  if (trade.status !== "DISPUTED") throw new TradeRuleError("La orden ya no está en disputa");
  if (decision === "RELEASE_TO_BUYER" && !trade.escrowHeld) {
    throw new TradeRuleError("No hay fondos retenidos en Escrow para liberar. El caso requiere gestión manual con el vendedor.");
  }

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const res = await tx.p2ptrade.updateMany({
      where: { id: trade.id, status: "DISPUTED" },
      data:
        decision === "RELEASE_TO_BUYER"
          ? { status: "COMPLETED", completedAt: now, escrowHeld: false, resolution: decision, resolutionNote: note, resolvedBy: adminId, resolvedAt: now }
          : { status: "CANCELLED", cancelledAt: trade.cancelledAt ?? now, cancelledBy: trade.cancelledBy ?? "MEDIATOR", escrowHeld: false, resolution: decision, resolutionNote: note, resolvedBy: adminId, resolvedAt: now },
    });
    if (res.count !== 1) throw new TradeRuleError("Otro administrador ya resolvió esta disputa");

    if (decision === "RELEASE_TO_BUYER") {
      const received = await settleToBuyer(tx, trade);
      await systemMessage(tx, trade.id, `VEREDICTO DEL MEDIADOR: fallo a favor del COMPRADOR. Se liberaron ${received.toFixed(2)} USDT al comprador. Motivo: ${note}`);
    } else {
      let dest = "";
      if (trade.escrowHeld) {
        const where = await refundEscrow(tx, trade);
        dest = where === "AD" ? "Los USDT regresaron al anuncio del vendedor." : "Los USDT regresaron a la billetera del vendedor.";
      }
      await systemMessage(tx, trade.id, `VEREDICTO DEL MEDIADOR: fallo a favor del VENDEDOR. ${dest} Motivo: ${note}`);
    }
    // Cualquier propuesta pendiente sobre este caso queda superada
    await tx.staffaction.updateMany({
      where: { targetId: trade.id, kind: "DISPUTE", status: "PENDING" },
      data: { status: "SUPERSEDED", reviewedBy: adminId, reviewedAt: now, reviewNote: "Resuelto directamente por un administrador" },
    });
  }, serializable);
  await publishTrade(trade.id, "RESOLVED", adminId);
}

async function executeKycDecision(adminId: string, userId: string, status: KycDecision, note?: string) {
  if (status !== "VERIFIED" && status !== "REJECTED") throw new TradeRuleError("Estado inválido");
  if (userId === adminId) throw new TradeRuleError("No puedes decidir sobre tu propio KYC");
  await prisma.$transaction(async (tx) => {
    const res = await tx.user.updateMany({ where: { id: userId, role: { not: "SYSTEM" } }, data: { kycStatus: status } });
    if (res.count !== 1) throw new TradeRuleError("Usuario no encontrado");
    await tx.staffaction.updateMany({
      where: { targetId: userId, kind: "KYC", status: "PENDING" },
      data: { status: "SUPERSEDED", reviewedBy: adminId, reviewedAt: new Date(), reviewNote: note ?? "Resuelto directamente por un administrador" },
    });
  });
}

const cleanNote = (note: unknown, min = 10) => {
  const n = String(note ?? "").trim().slice(0, 2000);
  if (n.length < min) throw new TradeRuleError(`Escribe la justificación (mínimo ${min} caracteres)`);
  return n;
};

/** Veredicto directo: SOLO ADMIN. */
export async function resolveDispute(idToken: string, tradeId: string, decision: DisputeDecision, note: string) {
  try {
    const admin = await requireAdmin(idToken);
    await executeDisputeResolution(admin.id, tradeId, decision, cleanNote(note));
    return { success: true as const };
  } catch (error) {
    console.error("Error resolving dispute:", error);
    return { success: false as const, error: toClientError(error, "No se pudo resolver la disputa") };
  }
}

// ============================================================================
//  KYC (lectura: staff · decisión: ADMIN)
// ============================================================================

export async function getKycQueue(idToken: string) {
  try {
    await requireStaff(idToken);
    const users = await prisma.user.findMany({
      where: { kycStatus: { in: ["PENDING", "REJECTED"] }, role: { not: "SYSTEM" } },
      orderBy: { updatedAt: "asc" },
      select: { id: true, name: true, firstName: true, lastName: true, email: true, document: true, documentType: true, kycOcrStatus: true, kycOcrNumbers: true, phone: true, address: true, kycStatus: true, updatedAt: true, _count: { select: { kycdocument: true } } },
    });
    const proposals = await pendingProposalsFor(users.map((u) => u.id));
    return {
      success: true as const,
      users: users.map((u) => ({
        id: u.id,
        name: displayName(u),
        email: u.email,
        document: u.document,
        documentType: u.documentType === "PASAPORTE" ? "Pasaporte" : u.documentType === "LICENCIA" ? "Licencia de conducir" : u.documentType === "CEDULA" ? "Cédula" : null,
        ocrStatus: (u.kycOcrStatus as "MATCH" | "MISMATCH" | "UNREADABLE" | null) ?? null,
        ocrNumbers: u.kycOcrNumbers,
        phone: u.phone,
        address: u.address,
        kycStatus: u.kycStatus,
        submittedAt: u.updatedAt.toISOString(),
        documents: u._count.kycdocument,
        pendingProposal: proposals.get(u.id) ?? null,
      })),
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo cargar la cola KYC"), users: [] };
  }
}

/** Decisión KYC directa: SOLO ADMIN. */
export async function setKycStatus(idToken: string, userId: string, status: KycDecision) {
  try {
    const admin = await requireAdmin(idToken);
    await executeKycDecision(admin.id, userId, status);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo actualizar el KYC") };
  }
}

/** Documentos KYC del usuario (almacenados fuera de /public) como data URLs, solo para staff. */
export async function getKycDocuments(idToken: string, userId: string) {
  try {
    await requireStaff(idToken);
    const docs = await prisma.kycdocument.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    const fs = await import("fs/promises");
    const path = await import("path");
    const root = path.join(process.cwd(), "private_uploads", "kyc");
    // Solo el documento más reciente de cada tipo
    const latest = new Map<string, (typeof docs)[number]>();
    for (const d of docs) if (!latest.has(d.kind)) latest.set(d.kind, d);
    const out: { kind: string; mime: string; dataUrl: string; createdAt: string }[] = [];
    for (const d of latest.values()) {
      const full = path.resolve(root, d.path);
      if (!full.startsWith(root)) continue; // anti path-traversal
      try {
        const buf = await fs.readFile(full);
        out.push({ kind: d.kind, mime: d.mime, dataUrl: `data:${d.mime};base64,${buf.toString("base64")}`, createdAt: d.createdAt.toISOString() });
      } catch {
        /* archivo ausente */
      }
    }
    return { success: true as const, documents: out };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudieron cargar los documentos"), documents: [] };
  }
}

// ============================================================================
//  PROPUESTAS DEL ROL SUPPORT (doble control: el ADMIN aprueba)
// ============================================================================

export async function proposeDecision(
  idToken: string,
  data: { kind: "DISPUTE" | "KYC"; targetId: string; decision: string; note: string }
) {
  try {
    const staff = await requireStaff(idToken);
    if (staff.role === "ADMIN") throw new TradeRuleError("Como administrador puedes resolver directamente");
    const kind = data.kind;
    const targetId = String(data.targetId ?? "");
    const note = cleanNote(data.note);

    if (kind === "DISPUTE") {
      if (data.decision !== "RELEASE_TO_BUYER" && data.decision !== "REFUND_TO_SELLER") throw new TradeRuleError("Decisión inválida");
      const trade = await prisma.p2ptrade.findUnique({ where: { id: targetId } });
      if (!trade) throw new TradeRuleError("Orden no encontrada");
      if (trade.status !== "DISPUTED") throw new TradeRuleError("La orden ya no está en disputa");
      if (trade.buyerId === staff.id || trade.sellerId === staff.id) throw new TradeRuleError("Conflicto de interés: participas en esta orden");
      if (data.decision === "RELEASE_TO_BUYER" && !trade.escrowHeld) throw new TradeRuleError("No hay fondos retenidos para liberar");
    } else if (kind === "KYC") {
      if (data.decision !== "VERIFIED" && data.decision !== "REJECTED") throw new TradeRuleError("Decisión inválida");
      if (targetId === staff.id) throw new TradeRuleError("No puedes decidir sobre tu propio KYC");
      const u = await prisma.user.findUnique({ where: { id: targetId }, select: { kycStatus: true } });
      if (!u) throw new TradeRuleError("Usuario no encontrado");
      if (u.kycStatus === "VERIFIED") throw new TradeRuleError("Este usuario ya está verificado");
    } else {
      throw new TradeRuleError("Tipo de propuesta inválido");
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.staffaction.count({ where: { targetId, kind, status: "PENDING" } });
      if (existing) throw new TradeRuleError("Ya existe una propuesta pendiente para este caso");
      await tx.staffaction.create({ data: { kind, targetId, decision: data.decision, note, proposedBy: staff.id } });
      if (kind === "DISPUTE") {
        await systemMessage(tx, targetId, "Un agente de soporte revisó el caso y envió su recomendación. La decisión final será tomada por un administrador de Roraima.");
      }
    });
    if (kind === "DISPUTE") await publishTrade(targetId, "MESSAGE", staff.id);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo enviar la propuesta") };
  }
}

async function serializeProposals(rows: Awaited<ReturnType<typeof loadProposals>>) {
  const tradeIds = rows.filter((r) => r.kind === "DISPUTE").map((r) => r.targetId);
  const userIds = rows.filter((r) => r.kind === "KYC").map((r) => r.targetId);
  const reviewerIds = rows.map((r) => r.reviewedBy).filter((x): x is string => !!x);
  const [trades, users, reviewers] = await Promise.all([
    prisma.p2ptrade.findMany({ where: { id: { in: tradeIds } }, select: { id: true, cryptoAmount: true, fiatAmount: true, status: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true, firstName: true, lastName: true, kycStatus: true } }),
    prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, email: true, name: true, firstName: true, lastName: true } }),
  ]);
  const tMap = new Map(trades.map((t) => [t.id, t]));
  const uMap = new Map(users.map((u) => [u.id, u]));
  const rMap = new Map(reviewers.map((u) => [u.id, displayName(u)]));
  return rows.map((r) => {
    const t = tMap.get(r.targetId);
    const u = uMap.get(r.targetId);
    return {
      id: r.id,
      kind: r.kind as "DISPUTE" | "KYC",
      targetId: r.targetId,
      decision: r.decision,
      decisionLabel: DECISION_LABEL[r.decision] ?? r.decision,
      note: r.note,
      status: r.status,
      proposer: displayName(r.proposer),
      proposerEmail: r.proposer.email,
      reviewer: r.reviewedBy ? rMap.get(r.reviewedBy) ?? null : null,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      target:
        r.kind === "DISPUTE"
          ? { label: `Orden #${r.targetId.slice(-8).toUpperCase()}`, detail: t ? `${t.cryptoAmount} USDT · ${t.fiatAmount.toLocaleString("es-VE")} VES · ${t.status}` : "Orden no encontrada" }
          : { label: u ? displayName(u) : "Usuario", detail: u ? `${u.email} · KYC ${u.kycStatus}` : "Usuario no encontrado" },
    };
  });
}

function loadProposals(where: { status?: string | { not: string }; proposedBy?: string }) {
  return prisma.staffaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { proposer: { select: { name: true, email: true, firstName: true, lastName: true } } },
  });
}

/** Cola de aprobaciones (ADMIN). */
export async function getProposals(idToken: string, view: "PENDING" | "HISTORY" = "PENDING") {
  try {
    await requireAdmin(idToken);
    const rows = await loadProposals(view === "PENDING" ? { status: "PENDING" } : { status: { not: "PENDING" } });
    return { success: true as const, proposals: await serializeProposals(rows) };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudieron cargar las propuestas"), proposals: [] };
  }
}

/** Propuestas del agente de soporte autenticado. */
export async function getMyProposals(idToken: string) {
  try {
    const staff = await requireStaff(idToken);
    const rows = await loadProposals({ proposedBy: staff.id });
    return { success: true as const, proposals: await serializeProposals(rows) };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudieron cargar tus propuestas"), proposals: [] };
  }
}

/** El ADMIN aprueba (y se ejecuta) o rechaza una propuesta del rol SUPPORT. */
export async function reviewProposal(idToken: string, proposalId: string, approve: boolean, note: string) {
  try {
    const admin = await requireAdmin(idToken);
    const p = await prisma.staffaction.findUnique({ where: { id: proposalId }, include: { proposer: { select: { name: true, email: true, firstName: true, lastName: true } } } });
    if (!p) throw new TradeRuleError("Propuesta no encontrada");
    if (p.status !== "PENDING") throw new TradeRuleError("Esta propuesta ya fue revisada");
    if (p.proposedBy === admin.id) throw new TradeRuleError("No puedes aprobar tu propia propuesta");
    const reviewNote = String(note ?? "").trim().slice(0, 1000);

    if (!approve) {
      if (reviewNote.length < 5) throw new TradeRuleError("Indica el motivo del rechazo");
      const res = await prisma.staffaction.updateMany({
        where: { id: p.id, status: "PENDING" },
        data: { status: "REJECTED", reviewedBy: admin.id, reviewedAt: new Date(), reviewNote },
      });
      if (res.count !== 1) throw new TradeRuleError("Otro administrador ya revisó esta propuesta");
      return { success: true as const };
    }

    // Aprobar = ejecutar la decisión con la identidad del ADMIN (las ejecuciones son idempotentes/condicionales)
    const finalNote = `${p.note} (Propuesto por ${displayName(p.proposer)} · aprobado por administración${reviewNote ? `: ${reviewNote}` : ""})`;
    try {
      if (p.kind === "DISPUTE") await executeDisputeResolution(admin.id, p.targetId, p.decision as DisputeDecision, finalNote);
      else await executeKycDecision(admin.id, p.targetId, p.decision as KycDecision, reviewNote || "Aprobado");
    } catch (e) {
      // El caso cambió mientras esperaba: la propuesta queda obsoleta
      const msg = e instanceof Error ? e.message : "El caso cambió";
      await prisma.staffaction.updateMany({
        where: { id: p.id, status: { in: ["PENDING", "SUPERSEDED"] } },
        data: { status: "REJECTED", reviewedBy: admin.id, reviewedAt: new Date(), reviewNote: `No se pudo ejecutar: ${msg}` },
      });
      throw e;
    }
    // La ejecución marcó la propuesta como SUPERSEDED; la dejamos como APROBADA
    await prisma.staffaction.update({
      where: { id: p.id },
      data: { status: "APPROVED", reviewedBy: admin.id, reviewedAt: new Date(), reviewNote: reviewNote || null },
    });
    return { success: true as const };
  } catch (error) {
    console.error("reviewProposal", error);
    return { success: false as const, error: toClientError(error, "No se pudo revisar la propuesta") };
  }
}

// ============================================================================
//  EQUIPO (solo ADMIN asigna el rol SUPPORT)
// ============================================================================

export async function listStaff(idToken: string) {
  try {
    await requireAdmin(idToken);
    const users = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPPORT"] } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true, email: true, name: true, firstName: true, lastName: true, role: true, kycStatus: true, createdAt: true },
    });
    const counts = await prisma.staffaction.groupBy({ by: ["proposedBy", "status"], _count: true, where: { proposedBy: { in: users.map((u) => u.id) } } });
    return {
      success: true as const,
      staff: users.map((u) => {
        const mine = counts.filter((c) => c.proposedBy === u.id);
        const n = (s: string) => mine.find((c) => c.status === s)?._count ?? 0;
        return {
          id: u.id,
          email: u.email,
          name: displayName(u),
          role: u.role,
          kycStatus: u.kycStatus,
          since: u.createdAt.toISOString(),
          proposals: { pending: n("PENDING"), approved: n("APPROVED"), rejected: n("REJECTED") },
        };
      }),
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo cargar el equipo"), staff: [] };
  }
}

export async function setStaffRole(idToken: string, email: string, role: "SUPPORT" | "USER") {
  try {
    const admin = await requireAdmin(idToken);
    if (role !== "SUPPORT" && role !== "USER") throw new TradeRuleError("Rol inválido");
    const target = await prisma.user.findUnique({ where: { email: String(email ?? "").trim().toLowerCase() } });
    if (!target || target.role === "SYSTEM") throw new TradeRuleError("No existe un usuario registrado con ese correo");
    if (target.id === admin.id) throw new TradeRuleError("No puedes cambiar tu propio rol");
    if (target.role === "ADMIN") throw new TradeRuleError("Los administradores solo se gestionan directamente en la base de datos");
    if (target.role === "BANNED") throw new TradeRuleError("La cuenta está suspendida");
    if (role === "SUPPORT" && target.kycStatus !== "VERIFIED") throw new TradeRuleError("El agente debe tener su KYC verificado");
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { role } });
      if (role === "USER") {
        // Al revocar el rol, sus propuestas pendientes dejan de ser válidas
        await tx.staffaction.updateMany({
          where: { proposedBy: target.id, status: "PENDING" },
          data: { status: "REJECTED", reviewedBy: admin.id, reviewedAt: new Date(), reviewNote: "Rol de soporte revocado" },
        });
      }
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo actualizar el rol") };
  }
}

// ============================================================================
//  MEMBRESÍA VIP (anuncios promocionados). Solo ADMIN la otorga mientras no
//  exista el cobro automático: se activa al confirmar el pago del miembro.
// ============================================================================

const VIP_PLANS = [30, 90, 365] as const;

export async function listVipMembers(idToken: string) {
  try {
    await requireAdmin(idToken);
    const users = await prisma.user.findMany({
      where: { vipUntil: { gt: new Date() } },
      orderBy: { vipUntil: "asc" },
      select: { id: true, email: true, name: true, firstName: true, lastName: true, kycStatus: true, vipUntil: true },
    });
    const ads = await prisma.p2porder.groupBy({ by: ["userId"], where: { userId: { in: users.map((u) => u.id) }, status: "OPEN" }, _count: true });
    return {
      success: true as const,
      members: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: displayName(u),
        kycStatus: u.kycStatus,
        vipUntil: u.vipUntil!.toISOString(),
        openAds: ads.find((a) => a.userId === u.id)?._count ?? 0,
      })),
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudieron cargar los miembros VIP"), members: [] };
  }
}

/** days > 0: otorga o EXTIENDE (suma a la fecha vigente). days = 0: revoca. */
export async function setVipMembership(idToken: string, email: string, days: number) {
  try {
    await requireAdmin(idToken);
    if (days !== 0 && !(VIP_PLANS as readonly number[]).includes(days)) throw new TradeRuleError("Plan inválido");
    const target = await prisma.user.findUnique({ where: { email: String(email ?? "").trim().toLowerCase() } });
    if (!target || target.role === "SYSTEM") throw new TradeRuleError("No existe un usuario registrado con ese correo");
    if (target.role === "BANNED") throw new TradeRuleError("La cuenta está suspendida");
    if (days > 0 && target.kycStatus !== "VERIFIED") throw new TradeRuleError("El miembro VIP debe tener su KYC verificado");
    const now = Date.now();
    const base = target.vipUntil && target.vipUntil.getTime() > now ? target.vipUntil.getTime() : now;
    const vipUntil = days === 0 ? null : new Date(base + days * 24 * 60 * 60 * 1000);
    await prisma.user.update({ where: { id: target.id }, data: { vipUntil } });
    return { success: true as const, vipUntil: vipUntil?.toISOString() ?? null };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo actualizar la membresía") };
  }
}

export async function fetchSystemSettings(idToken: string) {
  try {
    await requireStaff(idToken);
    const { getSystemSettings } = await import("@/lib/settings");
    const settings = await getSystemSettings();
    return { success: true as const, settings };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudieron cargar las configuraciones") };
  }
}

export async function saveSystemSettings(idToken: string, settings: Partial<SystemSettings>) {
  try {
    await requireAdmin(idToken);
    const { updateSystemSettings } = await import("@/lib/settings");
    await updateSystemSettings(settings);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudieron guardar las configuraciones") };
  }
}

