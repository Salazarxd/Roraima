"use server";

import { requireUser } from "@/lib/server-auth";
import prisma from "@/lib/prisma";
import crypto from "crypto";

export type LedgerEntry = {
  id: string;
  userId: string;
  userEmail: string;
  currency: string;
  type: string;
  amount: number;
  note: string;
  createdAt: Date;
};

export type LedgerAnomaly = {
  userId: string;
  email: string;
  currency: string;
  statedBalance: number;
  trueBalance: number;
  diff: number;
  chainBroken: boolean;
};

// 1. Obtener todas las transacciones (para el panel admin)
export async function getGlobalLedger(idToken: string, limit = 100) {
  try {
    const admin = await requireUser(idToken);
    if (admin.role !== "ADMIN") throw new Error("No autorizado");

    const txs = await prisma.wallettx.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { email: true } } }
    });

    return {
      success: true as const,
      data: txs.map(t => ({
        id: t.id,
        userId: t.userId,
        userEmail: t.user?.email || "Desconocido",
        currency: t.currency,
        type: t.type,
        amount: t.amount,
        note: t.note || "",
        createdAt: t.createdAt
      }))
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return { success: false as const, error };
  }
}

// 2. Escáner de anomalías (Anti-Hack Shield)
export async function runLedgerAudit(idToken: string) {
  try {
    const admin = await requireUser(idToken);
    if (admin.role !== "ADMIN") throw new Error("No autorizado");

    const wallets = await prisma.wallet.findMany({
      include: { user: true }
    });

    const anomalies: LedgerAnomaly[] = [];
    const suspendedUsers: string[] = [];

    for (const w of wallets) {
      // Sumar todas las transacciones inmutables
      const aggregations = await prisma.wallettx.aggregate({
        _sum: { amount: true },
        where: { userId: w.userId, currency: w.currency }
      });

      const trueBalance = aggregations._sum.amount || 0;
      const discrepancy = Math.abs(trueBalance - w.balance);

      // Verificación 2: Cadena de bloques de hashes
      const userTxs = await prisma.wallettx.findMany({
        where: { userId: w.userId, currency: w.currency },
        orderBy: { createdAt: "asc" }
      });

      let isValidChain = true;
      let lastHash = "0000000000000000000000000000000000000000000000000000000000000000";
      for (const t of userTxs) {
        if (!t.hash || !t.prevHash) continue; // Ignorar legacy

        if (t.prevHash !== lastHash) {
          isValidChain = false;
          break;
        }

        const rawString = `${t.userId}:${t.currency}:${t.type}:${t.amount}:${t.refId || ""}:${t.prevHash}`;
        const computedHash = crypto.createHash("sha256").update(rawString).digest("hex");
        
        if (computedHash !== t.hash) {
          isValidChain = false;
          break;
        }
        lastHash = t.hash;
      }

      // Considerar anomalía si la diferencia es mayor a un margen mínimo o si la cadena está rota
      if (discrepancy > 0.000001 || !isValidChain) {
        anomalies.push({
          userId: w.userId,
          email: w.user.email,
          currency: w.currency,
          statedBalance: w.balance,
          trueBalance: trueBalance,
          diff: discrepancy,
          chainBroken: !isValidChain
        });

        // Suspender al usuario preventivamente si no estaba ya suspendido
        if (w.user.status !== "SUSPENDED") {
          await prisma.user.update({
            where: { id: w.userId },
            data: { status: "SUSPENDED" }
          });
          suspendedUsers.push(w.user.email);
          
          // Alerta Crítica a la Administración
          console.error(`[ALERTA DE SEGURIDAD CRÍTICA] Usuario suspendido por anomalía en el Libro Mayor: ${w.user.email}`);
          console.error(`- Discrepancia: ${discrepancy}`);
          console.error(`- Cadena de Hashes Rota: ${!isValidChain}`);
          // TODO: Enviar webhook o notificación a Telegram
        }
      }
    }

    return {
      success: true as const,
      anomalies,
      suspendedUsers
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return { success: false as const, error };
  }
}

// 3. Generar informe detallado de un usuario anómalo
export async function getLedgerReport(idToken: string, userId: string) {
  try {
    const admin = await requireUser(idToken);
    if (admin.role !== "ADMIN") throw new Error("No autorizado");

    const txs = await prisma.wallettx.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" }
    });

    const wallet = await prisma.wallet.findFirst({
      where: { userId, currency: "USDT" }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, status: true }
    });

    let runningBalance = 0;
    const history = txs.map(t => {
      runningBalance += t.amount;
      return {
        ...t,
        runningBalance
      };
    });

    return {
      success: true as const,
      user,
      walletBalance: wallet?.balance || 0,
      calculatedBalance: runningBalance,
      history
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return { success: false as const, error };
  }
}
