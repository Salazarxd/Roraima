"use server";

import prisma from "@/lib/prisma";
import { fetchP2POrders } from "@/app/actions/p2p";
import { getReferenceRates } from "@/app/actions/exchange-rate";

/**
 * Datos PÚBLICOS para la página de inicio. Todo sale de la base de datos o de fuentes reales
 * (Binance P2P, BCV, paralelo). Si algo no está disponible se devuelve null y la UI lo oculta:
 * nunca se muestran cifras inventadas.
 */
export type LandingSnapshot = Awaited<ReturnType<typeof getLandingSnapshot>>;

const DAY_MS = 24 * 60 * 60 * 1000;
const mask = (name: string) => {
  const [first = "Usuario", last] = name.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
};

export async function getLandingSnapshot() {
  const since = new Date(Date.now() - DAY_MS);
  const [rates, sellAds, buyAds, verifiedUsers, completed, volume24h] = await Promise.all([
    getReferenceRates(),
    fetchP2POrders("SELL"),
    fetchP2POrders("BUY"),
    prisma.user.count({ where: { kycStatus: "VERIFIED", role: { notIn: ["SYSTEM", "BANNED"] } } }).catch(() => 0),
    prisma.p2ptrade.count({ where: { status: "COMPLETED" } }).catch(() => 0),
    prisma.p2ptrade.aggregate({ where: { status: "COMPLETED", completedAt: { gte: since } }, _sum: { cryptoAmount: true } }).catch(() => null),
  ]);

  const preview = (ads: typeof sellAds) =>
    ads.slice(0, 4).map((a) => ({
      id: a.id,
      price: a.price,
      available: a.amount,
      min: a.minAmount,
      max: a.maxAmount,
      methods: a.methods,
      merchant: mask(a.user.name),
      verified: a.user.kycStatus === "VERIFIED",
      rank: a.user.rank,
      completionRate: a.stats.completionRate,
      trades: a.stats.totalCompleted,
    }));

  return {
    rates: {
      roraima: rates.roraima,
      binance: rates.binance,
      bcv: rates.bcv,
      parallel: rates.parallel,
      updatedAt: rates.updatedAt,
    },
    market: {
      bestBuy: sellAds[0]?.price ?? null, // precio al que el usuario COMPRA USDT (mejor anuncio de venta)
      bestSell: buyAds[0]?.price ?? null, // precio al que el usuario VENDE USDT (mejor anuncio de compra)
      activeAds: sellAds.length + buyAds.length,
      sellPreview: preview(sellAds),
    },
    stats: {
      verifiedUsers,
      completedTrades: completed,
      volume24h: Math.round((volume24h?._sum.cryptoAmount ?? 0) * 100) / 100,
    },
  };
}
