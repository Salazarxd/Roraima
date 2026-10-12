"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";

export async function createPriceAlert(
  idToken: string,
  data: { targetPrice: number; direction: "ABOVE" | "BELOW" }
) {
  try {
    const user = await requireUser(idToken);
    const target = Math.round(Number(data.targetPrice) * 100) / 100;
    if (!Number.isFinite(target) || target <= 0) {
      throw new Error("El precio objetivo debe ser un número positivo");
    }
    const direction = data.direction === "BELOW" ? "BELOW" : "ABOVE";

    const count = await prisma.pricealert.count({
      where: { userId: user.id, active: true },
    });
    if (count >= 10) {
      throw new Error("Máximo 10 alertas activas simultáneas");
    }

    const alert = await prisma.pricealert.create({
      data: {
        userId: user.id,
        targetPrice: target,
        direction,
        active: true,
      },
    });

    return { success: true as const, alert };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo crear la alerta de precio") };
  }
}

export async function listPriceAlerts(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const alerts = await prisma.pricealert.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return { success: true as const, alerts };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudieron cargar las alertas"), alerts: [] };
  }
}

export async function deletePriceAlert(idToken: string, alertId: string) {
  try {
    const user = await requireUser(idToken);
    await prisma.pricealert.deleteMany({
      where: { id: alertId, userId: user.id },
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo eliminar la alerta") };
  }
}

/** Evalúa alertas y dispara notificación si se cumple el precio */
export async function evaluatePriceAlerts(idToken: string, currentRate: number) {
  try {
    const user = await requireUser(idToken);
    if (!currentRate || currentRate <= 0) return { success: true as const, triggered: 0 };

    const activeAlerts = await prisma.pricealert.findMany({
      where: { userId: user.id, active: true },
    });

    let triggered = 0;
    for (const a of activeAlerts) {
      const match =
        (a.direction === "ABOVE" && currentRate >= a.targetPrice) ||
        (a.direction === "BELOW" && currentRate <= a.targetPrice);

      if (match) {
        await prisma.pricealert.update({
          where: { id: a.id },
          data: { active: false, triggeredAt: new Date() },
        });

        // Crear notificación in-app en la campanita
        const symbol = a.direction === "ABOVE" ? "🚀 superó" : "📉 bajó de";
        await prisma.usernotification.create({
          data: {
            userId: user.id,
            title: `🔔 Alerta de Precio: USDT ${symbol} ${a.targetPrice.toFixed(2)} Bs`,
            body: `El precio de mercado actual se ubica en ${currentRate.toFixed(2)} Bs por USDT. Entra a operar ahora en el mercado P2P.`,
            kind: "SYSTEM",
            href: "/dashboard/p2p",
          },
        });
        triggered++;
      }
    }

    return { success: true as const, triggered };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error evaluando alertas"), triggered: 0 };
  }
}
