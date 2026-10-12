"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";
import { TradeRuleError } from "@/lib/ledger";

export async function leaveFeedback(idToken: string, tradeId: string, rating: "POSITIVE" | "NEGATIVE", comment?: string) {
  try {
    const user = await requireUser(idToken);
    
    // Validar el rating
    if (rating !== "POSITIVE" && rating !== "NEGATIVE") {
      throw new TradeRuleError("Calificación inválida");
    }

    const trade = await prisma.p2ptrade.findUnique({
      where: { id: tradeId },
      include: {
        user_p2ptrade_buyerIdTouser: { select: { id: true } },
        user_p2ptrade_sellerIdTouser: { select: { id: true } },
      }
    });

    if (!trade) throw new TradeRuleError("Trade no encontrado");
    
    if (trade.status !== "COMPLETED") {
      throw new TradeRuleError("Solo puedes dejar comentarios en órdenes completadas");
    }

    const isBuyer = trade.buyerId === user.id;
    const isSeller = trade.sellerId === user.id;

    if (!isBuyer && !isSeller) {
      throw new TradeRuleError("No participaste en esta orden");
    }

    const reviewedId = isBuyer ? trade.sellerId : trade.buyerId;

    // Cada participante puede calificar UNA vez a su contraparte (feedback mutuo, como Binance)
    const existing = await prisma.userfeedback.findUnique({
      where: { tradeId_reviewerId: { tradeId, reviewerId: user.id } }
    });

    if (existing) {
      throw new TradeRuleError("Ya has dejado tu comentario para esta orden");
    }

    await prisma.userfeedback.create({
      data: {
        tradeId,
        reviewerId: user.id,
        reviewedId,
        rating,
        comment: comment?.trim() || null,
      }
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al guardar el comentario") };
  }
}

export async function getUserReputation(userId: string) {
  try {
    const feedbacks = await prisma.userfeedback.findMany({
      where: { reviewedId: userId },
      select: { rating: true, comment: true, createdAt: true, reviewer: { select: { name: true, firstName: true } } },
      orderBy: { createdAt: "desc" },
      take: 10
    });

    const total = await prisma.userfeedback.count({ where: { reviewedId: userId } });
    const positives = await prisma.userfeedback.count({ where: { reviewedId: userId, rating: "POSITIVE" } });
    
    const percentage = total > 0 ? Math.round((positives / total) * 100) : 100;

    return {
      success: true as const,
      reputation: {
        total,
        positives,
        percentage,
        recentFeedback: feedbacks.map(f => ({
          rating: f.rating,
          comment: f.comment,
          date: f.createdAt.toISOString(),
          reviewer: f.reviewer.name || f.reviewer.firstName || "Usuario"
        }))
      }
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al cargar reputación") };
  }
}
