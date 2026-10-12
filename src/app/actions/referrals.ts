"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";
import crypto from "crypto";

export async function getReferralData(idToken: string) {
  try {
    const user = await requireUser(idToken);

    // Si el usuario aún no tiene código de referidos, generar uno único
    let code = user.referralCode;
    if (!code) {
      const base = (user.name || user.email.split("@")[0]).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "USER";
      const randomPart = crypto.randomBytes(2).toString("hex").toUpperCase();
      const newCode = `RRX-${base}-${randomPart}`;

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { referralCode: newCode },
      });
      code = updated.referralCode;
    }

    // Contar usuarios referidos
    const totalReferred = await prisma.user.count({
      where: { referredById: user.id },
    });

    // Calcular comisiones generadas por sus referidos (15% de las comisiones del sistema)
    const referredUsers = await prisma.user.findMany({
      where: { referredById: user.id },
      select: { id: true },
    });
    const referredIds = referredUsers.map((u) => u.id);

    let commissionEarned = 0;
    if (referredIds.length > 0) {
      const fees = await prisma.platformfee.aggregate({
        where: { userId: { in: referredIds } },
        _sum: { amount: true },
      });
      // 15% de recompensa de la comisión generada
      commissionEarned = (fees._sum.amount ?? 0) * 0.15;
    }

    return {
      success: true as const,
      referralCode: code,
      referralLink: `https://roraima.exchange/auth?ref=${code}`,
      totalReferred,
      commissionEarned: Math.round(commissionEarned * 100) / 100,
      rewardPercentage: 15, // 15% de comisión compartida
    };
  } catch (error) {
    return {
      success: false as const,
      error: toClientError(error, "No se pudo cargar la información de referidos"),
    };
  }
}
