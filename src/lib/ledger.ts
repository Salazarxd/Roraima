import "server-only";
import { Prisma } from "@prisma/client";
import crypto from "crypto";

/**
 * Libro mayor (ledger) de Roraima.
 *
 * TODO movimiento de saldo pasa por aquí: el cambio en `wallet.balance` y el asiento en
 * `wallettx` se escriben dentro de la MISMA transacción, de modo que el historial siempre
 * cuadra con el saldo. Los débitos son condicionales (`WHERE balance >= amount`) para que
 * dos peticiones simultáneas nunca gasten el mismo saldo (anti doble gasto).
 */

export type Tx = Prisma.TransactionClient;

export type LedgerType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "WITHDRAWAL_REFUND"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "P2P_ESCROW"
  | "P2P_REFUND"
  | "P2P_RECEIVE"
  | "AD_FREEZE"
  | "AD_UNFREEZE"
  | "FEE"
  | "ADJUSTMENT";

export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Error de regla de negocio: su mensaje SÍ es seguro para mostrar al usuario. */
export class TradeRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeRuleError";
  }
}

export const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 };

/** Reintenta transacciones que fallan por conflicto de serialización / deadlock (P2034). */
export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
      if (!retryable || attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, 40 * (attempt + 1) + Math.random() * 40));
    }
  }
}

type Entry = { type: LedgerType; refId?: string | null; note?: string | null };

/** Acredita USDT/USDC (crea la wallet si no existe) y registra el asiento. */
export async function credit(tx: Tx, userId: string, amount: number, entry: Entry, currency = "USDT") {
  const value = round6(amount);
  if (!(value > 0)) return;
  const safeCurrency = currency.toUpperCase().trim() || "USDT";
  const wallet = await tx.wallet.findFirst({ where: { userId, currency: safeCurrency } });
  if (wallet) {
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: value } } });
  } else {
    await tx.wallet.create({ data: { userId, currency: safeCurrency, balance: value } });
  }
  await createWalletTx(tx, { userId, currency: safeCurrency, type: entry.type, amount: value, refId: entry.refId ?? null, note: entry.note ?? null });
}

async function createWalletTx(tx: Tx, data: { userId: string, currency: string, type: LedgerType, amount: number, refId: string | null, note: string | null }) {
  const lastTx = await tx.wallettx.findFirst({
    where: { userId: data.userId, currency: data.currency },
    orderBy: { createdAt: "desc" },
    select: { hash: true }
  });
  
  const prevHash = lastTx?.hash || "0000000000000000000000000000000000000000000000000000000000000000";
  const rawString = `${data.userId}:${data.currency}:${data.type}:${data.amount}:${data.refId || ""}:${prevHash}`;
  const hash = crypto.createHash("sha256").update(rawString).digest("hex");
  
  await tx.wallettx.create({
    data: { ...data, prevHash, hash }
  });
}

/**
 * Debita USDT/USDC de forma ATÓMICA y CONDICIONAL. Devuelve false si no hay saldo suficiente
 * (en ese caso no se escribe nada).
 */
export async function debit(tx: Tx, userId: string, amount: number, entry: Entry, currency = "USDT"): Promise<boolean> {
  const value = round6(amount);
  if (!(value > 0)) return true;
  const safeCurrency = currency.toUpperCase().trim() || "USDT";
  const wallet = await tx.wallet.findFirst({ where: { userId, currency: safeCurrency } });
  if (!wallet) return false;
  const res = await tx.wallet.updateMany({
    where: { id: wallet.id, balance: { gte: value } },
    data: { balance: { decrement: value } },
  });
  if (res.count !== 1) return false;
  await createWalletTx(tx, { userId, currency: safeCurrency, type: entry.type, amount: -value, refId: entry.refId ?? null, note: entry.note ?? null });
  return true;
}

export const SYSTEM_USER_ID = "SYSTEM";

/** Garantiza que exista el usuario técnico "SYSTEM" (necesario por la FK de los mensajes). */
export async function ensureSystemUser(tx: Tx) {
  await tx.user.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {},
    create: { id: SYSTEM_USER_ID, email: "system@roraima.internal", name: "Sistema Roraima", role: "SYSTEM", kycStatus: "VERIFIED" },
  });
}

export async function systemMessage(tx: Tx, tradeId: string, content: string) {
  await ensureSystemUser(tx);
  await tx.p2pchatmessage.create({ data: { tradeId, senderId: SYSTEM_USER_ID, content: `[SISTEMA] ${content}` } });
}

// ============================================================================
//  P2P: comisiones y liquidación (compartido por p2p.ts y admin.ts)
// ============================================================================

/** Comisión del anunciante (maker). El tomador (taker) paga 0%. */
export const MAKER_FEE_RATE = 0.001;

type SettleTrade = {
  id: string;
  buyerId: string;
  sellerId: string;
  cryptoAmount: number;
  makerFee: number;
  makerId: string | null;
};

/**
 * Libera el escrow al comprador y registra la comisión del anunciante.
 *  - Anunciante VENDEDOR: la comisión ya se retuvo en el escrow → el comprador recibe el 100%.
 *  - Anunciante COMPRADOR: la comisión se descuenta de lo que recibe.
 * Devuelve lo que efectivamente recibió el comprador.
 */
export async function settleToBuyer(tx: Tx, trade: SettleTrade): Promise<number> {
  const fee = round6(trade.makerFee || 0);
  const makerIsBuyer = trade.makerId === trade.buyerId;
  const received = round6(makerIsBuyer ? trade.cryptoAmount - fee : trade.cryptoAmount);
  await credit(tx, trade.buyerId, received, { type: "P2P_RECEIVE", refId: trade.id, note: "USDT recibidos por orden P2P" });
  if (fee > 0 && trade.makerId) {
    await tx.platformfee.create({ data: { tradeId: trade.id, userId: trade.makerId, amount: fee, type: "MAKER_FEE" } });
    if (makerIsBuyer) {
      // Asiento informativo (importe 0 en saldo: ya se descontó del crédito)
      await createWalletTx(tx, { userId: trade.buyerId, currency: "USDT", type: "FEE", amount: 0, refId: trade.id, note: `Comisión de anunciante ${fee} USDT (descontada del monto recibido)` });
    }
  }
  return received;
}

type RefundTrade = {
  id: string;
  orderId: string;
  sellerId: string;
  cryptoAmount: number;
  escrowAmount: number;
  escrowSource: string;
};

/**
 * Devuelve el escrow de una orden cancelada:
 *  - Si salió de un anuncio de venta que sigue activo → vuelve a la liquidez del anuncio.
 *  - En cualquier otro caso → vuelve a la wallet del vendedor.
 * Devuelve "AD" o "WALLET" según el destino.
 */
export async function refundEscrow(tx: Tx, trade: RefundTrade): Promise<"AD" | "WALLET"> {
  const amount = round6(trade.escrowAmount > 0 ? trade.escrowAmount : trade.cryptoAmount);
  if (trade.escrowSource === "AD") {
    const res = await tx.p2porder.updateMany({
      where: { id: trade.orderId, status: { in: ["OPEN", "PAUSED"] } },
      data: { amount: { increment: amount } },
    });
    if (res.count === 1) return "AD";
  }
  await credit(tx, trade.sellerId, amount, { type: "P2P_REFUND", refId: trade.id, note: "Devolución de escrow P2P" });
  return "WALLET";
}
