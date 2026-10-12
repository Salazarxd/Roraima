"use server";

import prisma from "@/lib/prisma";

/**
 * Tasas de referencia REALES (sin valores inventados):
 *  - Binance P2P: promedio de los 3 mejores anuncios USDT/VES.
 *  - BCV (oficial) y paralelo: ve.dolarapi.com.
 *  - Roraima: mejor precio de venta publicado en nuestro propio mercado P2P.
 * Si una fuente no responde se devuelve `null` (la UI muestra "—"), nunca un número ficticio.
 */

type RatesResult = { binance: number | null; bcv: number | null; parallel: number | null; roraima: number | null; updatedAt: string };

let cache: { at: number; data: RatesResult } | null = null;
const TTL_MS = 5 * 60 * 1000;

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function binanceP2P(): Promise<number | null> {
  try {
    const json = await fetchJson("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiat: "VES", asset: "USDT", tradeType: "BUY", page: 1, rows: 5, payTypes: [], publisherType: null, countries: [] }),
    });
    const prices: number[] = (json?.data ?? [])
      .slice(0, 3)
      .map((item: { adv?: { price?: string } }) => parseFloat(item?.adv?.price ?? ""))
      .filter((n: number) => Number.isFinite(n) && n > 0);
    if (!prices.length) return null;
    return Number((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2));
  } catch {
    return null;
  }
}

async function dolarApi(): Promise<{ bcv: number | null; parallel: number | null }> {
  try {
    const json = (await fetchJson("https://ve.dolarapi.com/v1/dolares")) as { fuente: string; promedio: number | null }[];
    const pick = (f: string) => {
      const v = json.find((x) => x.fuente === f)?.promedio;
      return typeof v === "number" && v > 0 ? Number(v.toFixed(2)) : null;
    };
    return { bcv: pick("oficial"), parallel: pick("paralelo") };
  } catch {
    return { bcv: null, parallel: null };
  }
}

async function roraimaBest(): Promise<number | null> {
  try {
    const best = await prisma.p2porder.findFirst({
      where: { type: { startsWith: "SELL" }, status: "OPEN", amount: { gt: 0 } },
      orderBy: { price: "asc" },
      select: { price: true },
    });
    return best?.price ?? null;
  } catch {
    return null;
  }
}

export async function getReferenceRates(): Promise<RatesResult> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    // El precio interno cambia más seguido: siempre fresco
    return { ...cache.data, roraima: await roraimaBest() };
  }
  const [binance, dolar, roraima] = await Promise.all([binanceP2P(), dolarApi(), roraimaBest()]);
  const data: RatesResult = { binance, bcv: dolar.bcv, parallel: dolar.parallel, roraima, updatedAt: new Date().toISOString() };
  cache = { at: Date.now(), data };
  return data;
}

/** Tasa de mercado USDT/VES para la calculadora y estimaciones. */
export async function getLiveExchangeRate(): Promise<{ success: boolean; rate: number | null; source: string | null }> {
  const r = await getReferenceRates();
  if (r.roraima) return { success: true, rate: r.roraima, source: "Roraima P2P" };
  if (r.binance) return { success: true, rate: r.binance, source: "Binance P2P" };
  if (r.parallel) return { success: true, rate: r.parallel, source: "Paralelo" };
  return { success: false, rate: null, source: null };
}
