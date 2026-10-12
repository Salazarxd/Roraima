import "server-only";
import { createHash } from "crypto";

/**
 * Integración con la red TRON (USDT TRC-20) vía TronGrid.
 *
 * Variables de entorno:
 *  - TRON_DEPOSIT_ADDRESS   Dirección de la plataforma que recibe los depósitos (obligatoria para depósitos).
 *  - TRONGRID_API_KEY       API key de https://www.trongrid.io (recomendada: sin ella hay límites de tasa).
 *  - TRON_HOT_WALLET_ADDRESS Dirección desde la que se envían los retiros (opcional: si existe, se exige que
 *                            el TXID de cada retiro salga de ella).
 *  - WITHDRAW_FEE_USDT      Comisión fija de retiro (por defecto 1 USDT).
 *
 * Nunca se almacenan claves privadas en el servidor: los retiros los envía un operador desde su
 * billetera y el sistema VERIFICA en la blockchain que el TXID corresponda al retiro.
 */

export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const USDC_TRC20_CONTRACT = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";

export function getTokenContract(currency: string): string {
  const c = currency.toUpperCase().trim();
  if (c === "USDC") return USDC_TRC20_CONTRACT;
  return USDT_TRC20_CONTRACT;
}
const TRONGRID = "https://api.trongrid.io";
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function tronConfig() {
  const depositAddress = (process.env.TRON_DEPOSIT_ADDRESS ?? "").trim();
  const hotWallet = (process.env.TRON_HOT_WALLET_ADDRESS ?? "").trim();
  const apiKey = (process.env.TRONGRID_API_KEY ?? "").trim();
  const fee = Number(process.env.WITHDRAW_FEE_USDT ?? "1");
  return {
    depositAddress: isValidTronAddress(depositAddress) ? depositAddress : "",
    hotWallet: isValidTronAddress(hotWallet) ? hotWallet : "",
    apiKey,
    withdrawFee: Number.isFinite(fee) && fee >= 0 ? fee : 1,
    depositsEnabled: isValidTronAddress(depositAddress),
  };
}

function base58Decode(str: string): Buffer | null {
  let num = BigInt(0);
  for (const ch of str) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    num = num * BigInt(58) + BigInt(idx);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let bytes = Buffer.from(hex === "0" ? "" : hex, "hex");
  // Ceros iniciales ("1" en base58)
  let leading = 0;
  for (const ch of str) {
    if (ch === "1") leading++;
    else break;
  }
  if (leading) bytes = Buffer.concat([Buffer.alloc(leading), bytes]);
  return bytes;
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest();

/** Valida una dirección TRON (Base58Check, prefijo 0x41, checksum doble SHA-256). */
export function isValidTronAddress(addr: string): boolean {
  if (typeof addr !== "string" || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return false;
  const raw = base58Decode(addr);
  if (!raw || raw.length !== 25 || raw[0] !== 0x41) return false;
  const payload = raw.subarray(0, 21);
  const checksum = raw.subarray(21);
  return sha256(sha256(payload)).subarray(0, 4).equals(checksum);
}

export type Trc20Transfer = {
  txid: string;
  from: string;
  to: string;
  /** Valor en unidades mínimas (USDT y USDC en TRON tienen 6 decimales) */
  value: bigint;
  timestamp: number;
};

/**
 * Transferencias TRC-20 (USDT o USDC) CONFIRMADAS recibidas por `address` desde `minTimestamp`.
 */
export async function fetchIncomingToken(
  address: string,
  contractAddress: string = USDT_TRC20_CONTRACT,
  minTimestamp: number = 0,
  maxPages = 5
): Promise<Trc20Transfer[]> {
  const { apiKey } = tronConfig();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  const out: Trc20Transfer[] = [];
  let fingerprint: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({
      only_confirmed: "true",
      only_to: "true",
      contract_address: contractAddress,
      limit: "200",
      min_timestamp: String(Math.max(0, Math.floor(minTimestamp))),
      order_by: "block_timestamp,desc",
    });
    if (fingerprint) qs.set("fingerprint", fingerprint);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let json: {
      success?: boolean;
      data?: { transaction_id: string; from: string; to: string; value: string; type: string; block_timestamp: number; token_info?: { address?: string } }[];
      meta?: { fingerprint?: string };
    };
    try {
      const res = await fetch(`${TRONGRID}/v1/accounts/${address}/transactions/trc20?${qs}`, { headers, cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}`);
      json = await res.json();
    } finally {
      clearTimeout(timer);
    }
    for (const t of json.data ?? []) {
      if (t.type !== "Transfer") continue;
      if (t.token_info?.address && t.token_info.address !== contractAddress) continue;
      if (t.to !== address) continue;
      try {
        out.push({ txid: t.transaction_id, from: t.from, to: t.to, value: BigInt(t.value), timestamp: t.block_timestamp });
      } catch {
        /* valor no numérico: se ignora */
      }
    }
    fingerprint = json.meta?.fingerprint;
    if (!fingerprint) break;
  }
  return out;
}

export async function fetchIncomingUsdt(address: string, minTimestamp: number, maxPages = 5): Promise<Trc20Transfer[]> {
  return fetchIncomingToken(address, USDT_TRC20_CONTRACT, minTimestamp, maxPages);
}

/** Convierte un monto a unidades mínimas (6 decimales) sin errores de coma flotante. */
export function toSun(amount: number): bigint {
  return BigInt(Math.round(amount * 1e6));
}
