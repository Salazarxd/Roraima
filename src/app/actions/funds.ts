"use server";

import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";
import { requireAdmin, requireUser, toClientError } from "@/lib/server-auth";
import { assertProfileComplete } from "@/lib/profile";
import * as OTPAuth from "otpauth";
import { verifyTotpWithRateLimit } from "@/lib/two-factor-guard";
import { credit, debit, round6, serializable, TradeRuleError, withRetry } from "@/lib/ledger";
import { fetchIncomingUsdt, isValidTronAddress, toSun } from "@/lib/tron";
import { getSystemSettings } from "@/lib/settings";

// ============================================================================
//  POLÍTICAS DE FONDOS
// ============================================================================
const MIN_DEPOSIT = 1;
const MAX_DEPOSIT = 100000;
const DEPOSIT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_DEPOSITS = 3;
const MIN_WITHDRAW = 5;
const MAX_WITHDRAW_24H = 10000;
const MAX_PENDING_WITHDRAWALS = 3;
const MIN_TRANSFER = 0.1;
const ACTIVE_TRADE_STATUSES = ["PENDING_PAYMENT", "PAID", "DISPUTED"];

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ============================================================================
//  RESUMEN DE BILLETERA (saldo, bloqueado y movimientos reales)
// ============================================================================

export async function getWalletOverview(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const [wallets, sellAds, escrows, pendingW, recent] = await Promise.all([
      prisma.wallet.findMany({ where: { userId: user.id } }),
      prisma.p2porder.aggregate({
        where: { userId: user.id, type: { startsWith: "SELL" }, status: { in: ["OPEN", "PAUSED"] } },
        _sum: { amount: true },
      }),
      prisma.p2ptrade.findMany({
        where: { sellerId: user.id, escrowHeld: true, status: { in: ACTIVE_TRADE_STATUSES } },
        select: { escrowAmount: true, cryptoAmount: true },
      }),
      prisma.withdrawal.aggregate({ where: { userId: user.id, status: "PENDING" }, _sum: { amount: true } }),
      prisma.wallettx.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 25 }),
    ]);
    const inAds = round6(sellAds._sum.amount ?? 0);
    const inEscrow = round6(escrows.reduce((s, t) => s + (t.escrowAmount > 0 ? t.escrowAmount : t.cryptoAmount), 0));
    const inWithdrawals = round6(pendingW._sum.amount ?? 0);
    const usdtWallet = wallets.find((w) => w.currency === "USDT");
    const usdcWallet = wallets.find((w) => w.currency === "USDC");
    const usdtBalance = round6(usdtWallet?.balance ?? 0);
    const usdcBalance = round6(usdcWallet?.balance ?? 0);
    const available = usdtBalance;
    const totalUsd = round6(usdtBalance + usdcBalance + inAds + inEscrow + inWithdrawals);
    return {
      success: true as const,
      available,
      usdtBalance,
      usdcBalance,
      locked: { ads: inAds, escrow: inEscrow, withdrawals: inWithdrawals, total: round6(inAds + inEscrow + inWithdrawals) },
      total: totalUsd,
      recent: recent.map((t) => ({ id: t.id, type: t.type, amount: t.amount, refId: t.refId, note: t.note, createdAt: t.createdAt.toISOString() })),
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo cargar la billetera") };
  }
}

export async function getWalletHistory(idToken: string, take = 100) {
  try {
    const user = await requireUser(idToken);
    const rows = await prisma.wallettx.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(take, 1), 300) });
    return { success: true as const, rows: rows.map((t) => ({ id: t.id, type: t.type, amount: t.amount, refId: t.refId, note: t.note, createdAt: t.createdAt.toISOString() })) };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo cargar el historial"), rows: [] };
  }
}

export async function getFundsConfig() {
  const cfg = await getSystemSettings();
  return {
    depositsEnabled: true,
    depositAddress: cfg.tronDepositAddress || null,
    network: "TRC20",
    networks: ["TRC20"],
    supportedCurrencies: ["USDT", "USDC"],
    withdrawFee: cfg.withdrawFeeUsdt,
    minWithdraw: MIN_WITHDRAW,
    minDeposit: MIN_DEPOSIT,
    maxWithdraw24h: MAX_WITHDRAW_24H,
  };
}

// ============================================================================
//  DEPÓSITOS (verificación automática en la blockchain TRON)
// ============================================================================

function serializeDeposit(d: { id: string; network: string; requestedAmount: number; expectedAmount: number; status: string; txid: string | null; createdAt: Date; expiresAt: Date; creditedAt: Date | null }) {
  return {
    id: d.id,
    network: d.network,
    requestedAmount: d.requestedAmount,
    expectedAmount: d.expectedAmount,
    status: d.status,
    txid: d.txid,
    createdAt: d.createdAt.toISOString(),
    expiresAt: d.expiresAt.toISOString(),
    creditedAt: iso(d.creditedAt),
  };
}

/** Obtiene o genera la dirección de depósito única permanente del usuario (BIP-44 HD Wallet). */
export async function getMyDepositAddress(idToken: string, currency = "USDT", network = "TRC20") {
  try {
    const user = await requireUser(idToken);
    const { getOrCreateUserDepositAddress } = await import("@/lib/hd-wallet");
    const safeCurrency = currency.toUpperCase() === "USDC" ? "USDC" : "USDT";
    const res = await getOrCreateUserDepositAddress(user.id, network, safeCurrency);
    return {
      success: true as const,
      address: res.address,
      network: res.network,
      currency: safeCurrency,
    };
  } catch (error) {
    console.error("getMyDepositAddress error:", error);
    return { success: false as const, error: toClientError(error, "No se pudo obtener la dirección de depósito") };
  }
}

/**
 * Escanea y acredita depósitos entrantes en la dirección única del usuario desde TronGrid.
 * Acredita automáticamente en el libro mayor y la billetera del usuario.
 */
export async function checkUserDeposits(idToken: string, currency = "USDT", network = "TRC20") {
  try {
    const user = await requireUser(idToken);
    const { getOrCreateUserDepositAddress } = await import("@/lib/hd-wallet");
    const { fetchIncomingToken, getTokenContract } = await import("@/lib/tron");
    const safeCurrency = currency.toUpperCase() === "USDC" ? "USDC" : "USDT";
    const contract = getTokenContract(safeCurrency);

    // 1. Obtener la dirección asignada al usuario
    const { address } = await getOrCreateUserDepositAddress(user.id, network, safeCurrency);

    // 2. Consultar transferencias confirmadas hacia esta dirección (últimos 7 días)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let transfers;
    try {
      transfers = await fetchIncomingToken(address, contract, sevenDaysAgo, 5);
    } catch (e) {
      console.error("TronGrid error in checkUserDeposits", e);
      throw new TradeRuleError("No se pudo consultar la red TRON en este momento. Intenta en unos segundos.");
    }

    let newlyCreditedCount = 0;
    let totalCreditedAmount = 0;

    for (const t of transfers) {
      // Verificar si ya fue procesado
      const existing = await prisma.deposit.findUnique({ where: { txid: t.txid } });
      if (existing) continue;

      const rawAmount = Number(t.value) / 1e6;
      if (rawAmount < MIN_DEPOSIT) continue; // Ignorar transferencias spam menores al mínimo

      const amount = round6(rawAmount);

      try {
        await withRetry(() =>
          prisma.$transaction(async (tx) => {
            // Crear el registro de depósito acreditado
            await tx.deposit.create({
              data: {
                userId: user.id,
                network,
                requestedAmount: amount,
                expectedAmount: amount,
                status: "CREDITED",
                txid: t.txid,
                fromAddress: t.from,
                expiresAt: new Date(t.timestamp + 86400000),
                creditedAt: new Date(t.timestamp),
              },
            });

            // Acreditar saldo en la billetera y libro mayor
            await credit(
              tx,
              user.id,
              amount,
              {
                type: "DEPOSIT",
                refId: t.txid,
                note: `Depósito ${safeCurrency} TRC20 · TXID ${t.txid.slice(0, 10)}...`,
              },
              safeCurrency
            );
          }, serializable)
        );
        newlyCreditedCount++;
        totalCreditedAmount += amount;
      } catch (e) {
        if ((e as { code?: string })?.code === "P2002") continue;
        console.error("Error al acreditar depósito", e);
      }
    }

    const rows = await prisma.deposit.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return {
      success: true as const,
      address,
      currency: safeCurrency,
      network,
      newlyCreditedCount,
      totalCreditedAmount: round6(totalCreditedAmount),
      deposits: rows.map(serializeDeposit),
    };
  } catch (error) {
    console.error("checkUserDeposits", error);
    return { success: false as const, error: toClientError(error, "No se pudieron verificar los depósitos") };
  }
}

/**
 * Crea una intención de depósito con un monto ÚNICO (se añaden de 1 a 999 diezmilésimas).
 * Así un depósito entrante a la dirección compartida se puede atribuir sin ambigüedad al usuario.
 */
export async function createDepositIntent(idToken: string, amount: number) {
  try {
    const user = await requireUser(idToken);
    const cfg = await getSystemSettings();
    if (!cfg.tronDepositAddress) throw new TradeRuleError("Los depósitos aún no están habilitados en esta plataforma");
    if (typeof amount !== "number" || !Number.isFinite(amount)) throw new TradeRuleError("Monto inválido");
    const base = Math.floor(amount * 100) / 100;
    if (base < MIN_DEPOSIT || base > MAX_DEPOSIT) throw new TradeRuleError(`El depósito debe estar entre ${MIN_DEPOSIT} y ${MAX_DEPOSIT} USDT`);

    // Expirar intenciones vencidas del usuario
    await prisma.deposit.updateMany({ where: { userId: user.id, status: "PENDING", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } });
    const pending = await prisma.deposit.count({ where: { userId: user.id, status: "PENDING" } });
    if (pending >= MAX_PENDING_DEPOSITS) throw new TradeRuleError("Tienes depósitos pendientes. Complétalos o espera a que expiren.");

    for (let attempt = 0; attempt < 15; attempt++) {
      const suffix = 1 + Math.floor(Math.random() * 999); // 0.0001 – 0.0999
      const expectedAmount = round6(base + suffix / 10000);
      const clash = await prisma.deposit.count({ where: { status: "PENDING", expectedAmount } });
      if (clash) continue;
      const dep = await prisma.deposit.create({
        data: { userId: user.id, network: "TRC20", requestedAmount: base, expectedAmount, status: "PENDING", expiresAt: new Date(Date.now() + DEPOSIT_TTL_MS) },
      });
      return { success: true as const, deposit: serializeDeposit(dep), address: cfg.tronDepositAddress };
    }
    throw new TradeRuleError("No se pudo generar un monto único. Intenta con otro monto.");
  } catch (error) {
    console.error("createDepositIntent", error);
    return { success: false as const, error: toClientError(error, "No se pudo crear el depósito") };
  }
}

/** Busca en la blockchain la transferencia del depósito y la acredita (idempotente). */
export async function checkDeposit(idToken: string, depositId: string) {
  try {
    const user = await requireUser(idToken);
    const cfg = await getSystemSettings();
    if (!cfg.tronDepositAddress) throw new TradeRuleError("Los depósitos aún no están habilitados");
    const dep = await prisma.deposit.findUnique({ where: { id: depositId } });
    if (!dep || dep.userId !== user.id) throw new TradeRuleError("Depósito no encontrado");
    if (dep.status !== "PENDING") return { success: true as const, deposit: serializeDeposit(dep) };

    let transfers;
    try {
      transfers = await fetchIncomingUsdt(cfg.tronDepositAddress, dep.createdAt.getTime() - 60_000);
    } catch (e) {
      console.error("TronGrid error", e);
      throw new TradeRuleError("No se pudo consultar la red TRON en este momento. Intenta en unos segundos.");
    }

    const target = toSun(dep.expectedAmount);
    const candidates = transfers.filter((t) => t.value === target && t.timestamp >= dep.createdAt.getTime() - 60_000 && t.timestamp <= dep.expiresAt.getTime());
    for (const t of candidates) {
      const used = await prisma.deposit.count({ where: { txid: t.txid } });
      if (used) continue;
      try {
        await withRetry(() =>
          prisma.$transaction(async (tx) => {
            const res = await tx.deposit.updateMany({
              where: { id: dep.id, status: "PENDING" },
              data: { status: "CREDITED", txid: t.txid, fromAddress: t.from, creditedAt: new Date() },
            });
            if (res.count !== 1) throw new TradeRuleError("El depósito ya fue procesado");
            await credit(tx, user.id, dep.expectedAmount, { type: "DEPOSIT", refId: dep.id, note: `Depósito USDT TRC20 · TXID ${t.txid}` });
          }, serializable)
        );
      } catch (e) {
        // P2002 = el TXID ya fue usado por otro depósito (carrera): probar el siguiente candidato
        if ((e as { code?: string })?.code === "P2002") continue;
        throw e;
      }
      const fresh = await prisma.deposit.findUnique({ where: { id: dep.id } });
      return { success: true as const, deposit: serializeDeposit(fresh!), credited: true };
    }

    if (dep.expiresAt.getTime() < Date.now()) {
      await prisma.deposit.updateMany({ where: { id: dep.id, status: "PENDING" }, data: { status: "EXPIRED" } });
      const fresh = await prisma.deposit.findUnique({ where: { id: dep.id } });
      return { success: true as const, deposit: serializeDeposit(fresh!) };
    }
    return { success: true as const, deposit: serializeDeposit(dep), credited: false };
  } catch (error) {
    console.error("checkDeposit", error);
    return { success: false as const, error: toClientError(error, "No se pudo verificar el depósito") };
  }
}

export async function listDeposits(idToken: string) {
  try {
    const user = await requireUser(idToken);
    await prisma.deposit.updateMany({ where: { userId: user.id, status: "PENDING", expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }, data: { status: "EXPIRED" } });
    const rows = await prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 });
    return { success: true as const, deposits: rows.map(serializeDeposit) };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudieron cargar los depósitos"), deposits: [] };
  }
}

// ============================================================================
//  RETIROS (débito inmediato + envío verificado por un operador)
// ============================================================================

function serializeWithdrawal(w: { id: string; amount: number; fee: number; netAmount: number; address: string; network: string; status: string; txid: string | null; note: string | null; createdAt: Date; processedAt: Date | null }) {
  return {
    id: w.id,
    amount: w.amount,
    fee: w.fee,
    netAmount: w.netAmount,
    address: w.address,
    network: w.network,
    status: w.status,
    txid: w.txid,
    note: w.note,
    createdAt: w.createdAt.toISOString(),
    processedAt: iso(w.processedAt),
  };
}

export async function requestWithdrawal(idToken: string, data: { amount: number; address: string; twoFactorCode?: string }) {
  try {
    const user = await requireUser(idToken);
    assertProfileComplete(user);
    if (user.kycStatus !== "VERIFIED") throw new TradeRuleError("Debes completar tu verificación KYC para retirar");
    
    if (user.twoFactorEnabled) {
      if (!data.twoFactorCode) throw new TradeRuleError("Se requiere código de autenticación 2FA");
      if (!user.twoFactorSecret) throw new TradeRuleError("Error de configuración 2FA");
      verifyTotpWithRateLimit(user.id, user.twoFactorSecret, data.twoFactorCode, user.email);
    }

    const cfg = await getSystemSettings();
    const address = String(data.address ?? "").trim();
    if (!isValidTronAddress(address)) throw new TradeRuleError("Dirección TRON (TRC20) inválida. Debe comenzar con 'T' y tener 34 caracteres.");
    if (cfg.tronDepositAddress && address === cfg.tronDepositAddress) throw new TradeRuleError("No puedes retirar a la dirección de depósito de la plataforma");

    if (user.whitelistEnabled) {
      const isWhitelisted = await prisma.whitelistaddress.count({ where: { userId: user.id, address } });
      if (!isWhitelisted) throw new TradeRuleError("Retiros restringidos a tu Lista Blanca. Agrega esta dirección en Seguridad.");
    }

    const amount = Math.floor(Number(data.amount) * 1e6) / 1e6;
    if (!Number.isFinite(amount) || amount < MIN_WITHDRAW) throw new TradeRuleError(`El retiro mínimo es ${MIN_WITHDRAW} USDT`);
    const fee = cfg.withdrawFeeUsdt;
    const netAmount = round6(amount - fee);
    if (netAmount <= 0) throw new TradeRuleError("El monto no cubre la comisión de red");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [pending, last24] = await Promise.all([
      prisma.withdrawal.count({ where: { userId: user.id, status: "PENDING" } }),
      prisma.withdrawal.aggregate({ where: { userId: user.id, status: { in: ["PENDING", "COMPLETED"] }, createdAt: { gte: since } }, _sum: { amount: true } }),
    ]);
    if (pending >= MAX_PENDING_WITHDRAWALS) throw new TradeRuleError("Tienes demasiados retiros pendientes");
    if ((last24._sum.amount ?? 0) + amount > MAX_WITHDRAW_24H) throw new TradeRuleError(`Límite de retiro de ${MAX_WITHDRAW_24H} USDT cada 24 h alcanzado`);

    const w = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const created = await tx.withdrawal.create({ data: { userId: user.id, amount, fee, netAmount, address, network: "TRC20", status: "PENDING" } });
        const ok = await debit(tx, user.id, amount, { type: "WITHDRAWAL", refId: created.id, note: `Retiro a ${address.slice(0, 6)}…${address.slice(-4)}` });
        if (!ok) throw new TradeRuleError("Saldo disponible insuficiente");
        return created;
      }, serializable)
    );
    return { success: true as const, withdrawal: serializeWithdrawal(w) };
  } catch (error) {
    console.error("requestWithdrawal", error);
    return { success: false as const, error: toClientError(error, "No se pudo solicitar el retiro") };
  }
}

export async function cancelWithdrawal(idToken: string, withdrawalId: string) {
  try {
    const user = await requireUser(idToken);
    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const w = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
        if (!w || w.userId !== user.id) throw new TradeRuleError("Retiro no encontrado");
        const res = await tx.withdrawal.updateMany({ where: { id: w.id, status: "PENDING" }, data: { status: "CANCELLED", processedAt: new Date() } });
        if (res.count !== 1) throw new TradeRuleError("Este retiro ya fue procesado y no se puede cancelar");
        await credit(tx, user.id, w.amount, { type: "WITHDRAWAL_REFUND", refId: w.id, note: "Retiro cancelado por el usuario" });
      }, serializable)
    );
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo cancelar el retiro") };
  }
}

export async function listWithdrawals(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const rows = await prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 });
    return { success: true as const, withdrawals: rows.map(serializeWithdrawal) };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudieron cargar los retiros"), withdrawals: [] };
  }
}

// --- Panel de staff ---------------------------------------------------------

export async function getPendingWithdrawals(idToken: string) {
  try {
    await requireAdmin(idToken);
    const rows = await prisma.withdrawal.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, email: true, name: true, kycStatus: true } } },
    });
    return {
      success: true as const,
      hotWallet: (await getSystemSettings()).tronHotWalletAddress || null,
      withdrawals: rows.map((w) => ({ ...serializeWithdrawal(w), user: w.user })),
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudieron cargar los retiros"), withdrawals: [], hotWallet: null };
  }
}

/** Aprueba un retiro manual por parte del Super Admin o con verificación de TXID on-chain */
export async function approveWithdrawal(
  idToken: string,
  withdrawalId: string,
  txidOrOptions?: string | { txid?: string; isManual?: boolean; note?: string }
) {
  try {
    const staff = await requireAdmin(idToken);
    const isOptionsObject = typeof txidOrOptions === "object" && txidOrOptions !== null;
    const isManual = isOptionsObject ? !!txidOrOptions.isManual : (!txidOrOptions || txidOrOptions === "MANUAL");
    const providedTx = isOptionsObject ? txidOrOptions.txid : (txidOrOptions !== "MANUAL" ? txidOrOptions : "");
    const cleanTx = String(providedTx ?? "").trim().toLowerCase();

    const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!w) throw new TradeRuleError("Retiro no encontrado");
    if (w.userId === staff.id) throw new TradeRuleError("Conflicto de interés: no puedes aprobar tu propio retiro");
    if (w.status !== "PENDING") throw new TradeRuleError("Este retiro ya fue procesado");

    const finalTxid = cleanTx || `MANUAL-${Date.now().toString(36).toUpperCase()}`;

    if (cleanTx) {
      if (/^[0-9a-f]{64}$/.test(cleanTx)) {
        const reused = await prisma.withdrawal.count({ where: { txid: cleanTx } });
        if (reused) throw new TradeRuleError("Ese TXID ya fue usado en otro retiro");
        if (!isManual) {
          try {
            const transfers = await fetchIncomingUsdt(w.address, w.createdAt.getTime() - 60_000);
            const match = transfers.find((t) => t.txid.toLowerCase() === cleanTx);
            if (!match) throw new TradeRuleError("No se encontró una transferencia USDT confirmada con ese TXID hacia la dirección del usuario");
            if (match.value !== toSun(w.netAmount)) throw new TradeRuleError(`El monto enviado no coincide. Se esperaban ${w.netAmount} USDT`);
          } catch (e) {
            if (e instanceof TradeRuleError) throw e;
          }
        }
      }
    }

    const res = await prisma.withdrawal.updateMany({
      where: { id: w.id, status: "PENDING" },
      data: {
        status: "COMPLETED",
        txid: finalTxid,
        processedBy: staff.id,
        processedAt: new Date(),
        note: isManual ? "Retiro manual aprobado por tesorería" : undefined,
      },
    });
    if (res.count !== 1) throw new TradeRuleError("Otro operador ya procesó este retiro");
    return { success: true as const };
  } catch (error) {
    console.error("approveWithdrawal", error);
    return { success: false as const, error: toClientError(error, "No se pudo aprobar el retiro") };
  }
}

export async function rejectWithdrawal(idToken: string, withdrawalId: string, note?: string) {
  try {
    const staff = await requireAdmin(idToken);
    const cleanNote = String(note ?? "").trim().slice(0, 500) || "Retiro rechazado por el administrador - Fondos devueltos al saldo";
    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const w = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
        if (!w) throw new TradeRuleError("Retiro no encontrado");
        if (w.userId === staff.id) throw new TradeRuleError("Conflicto de interés");
        const res = await tx.withdrawal.updateMany({
          where: { id: w.id, status: "PENDING" },
          data: { status: "REJECTED", note: cleanNote, processedBy: staff.id, processedAt: new Date() },
        });
        if (res.count !== 1) throw new TradeRuleError("Este retiro ya fue procesado");
        await credit(tx, w.userId, w.amount, { type: "WITHDRAWAL_REFUND", refId: w.id, note: `Retiro rechazado: ${cleanNote}` });
      }, serializable)
    );
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo rechazar el retiro") };
  }
}

// ============================================================================
//  TRANSFERENCIA INTERNA (gratis e instantánea entre usuarios de Roraima)
// ============================================================================

export async function transferInternal(idToken: string, data: { email: string; amount: number; twoFactorCode?: string }) {
  try {
    const user = await requireUser(idToken);
    assertProfileComplete(user);
    if (user.kycStatus !== "VERIFIED") throw new TradeRuleError("Debes completar tu verificación KYC para transferir");

    if (user.twoFactorEnabled) {
      if (!data.twoFactorCode) throw new TradeRuleError("Se requiere código de autenticación 2FA");
      if (!user.twoFactorSecret) throw new TradeRuleError("Error de configuración 2FA");
      verifyTotpWithRateLimit(user.id, user.twoFactorSecret, data.twoFactorCode, user.email);
    }

    const email = String(data.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TradeRuleError("Correo inválido");
    const amount = Math.floor(Number(data.amount) * 1e6) / 1e6;
    if (!Number.isFinite(amount) || amount < MIN_TRANSFER) throw new TradeRuleError(`El monto mínimo es ${MIN_TRANSFER} USDT`);

    const recipient = await prisma.user.findUnique({ where: { email } });
    if (!recipient || ["SYSTEM", "BANNED"].includes(recipient.role)) throw new TradeRuleError("No existe un usuario activo con ese correo");
    if (recipient.id === user.id) throw new TradeRuleError("No puedes transferirte a ti mismo");

    const ref = randomUUID();
    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const ok = await debit(tx, user.id, amount, { type: "TRANSFER_OUT", refId: ref, note: `Transferencia a ${email}` });
        if (!ok) throw new TradeRuleError("Saldo disponible insuficiente");
        await credit(tx, recipient.id, amount, { type: "TRANSFER_IN", refId: ref, note: `Transferencia de ${user.email}` });
      }, serializable)
    );
    return { success: true as const, recipientName: recipient.name || email };
  } catch (error) {
    console.error("transferInternal", error);
    return { success: false as const, error: toClientError(error, "No se pudo completar la transferencia") };
  }
}
