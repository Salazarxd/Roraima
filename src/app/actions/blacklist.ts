"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";
import { TradeRuleError } from "@/lib/ledger";

export async function getBlockedUsers(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const blocks = await prisma.userblock.findMany({
      where: { blockerId: user.id },
      include: {
        blocked: { select: { id: true, name: true, firstName: true, lastName: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    
    return {
      success: true as const,
      blocks: blocks.map((b) => ({
        id: b.blocked.id,
        name: b.blocked.name || [b.blocked.firstName, b.blocked.lastName].filter(Boolean).join(" ") || "Usuario",
        blockedAt: b.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al cargar la lista de bloqueados") };
  }
}

export async function blockUser(idToken: string, targetUserId: string) {
  try {
    const user = await requireUser(idToken);
    if (user.id === targetUserId) throw new TradeRuleError("No puedes bloquearte a ti mismo");

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new TradeRuleError("Usuario no encontrado");

    // Verificar si hay órdenes P2P activas entre ambos
    const activeTrades = await prisma.p2ptrade.count({
      where: {
        OR: [
          { buyerId: user.id, sellerId: targetUserId },
          { buyerId: targetUserId, sellerId: user.id },
        ],
        status: { in: ["PENDING_PAYMENT", "PAID", "DISPUTED"] }
      }
    });

    if (activeTrades > 0) {
      throw new TradeRuleError("No puedes bloquear a este usuario mientras tengan una orden P2P activa o en disputa");
    }

    await prisma.userblock.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: targetUserId } },
      update: {},
      create: { blockerId: user.id, blockedId: targetUserId },
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al bloquear al usuario") };
  }
}

export async function unblockUser(idToken: string, targetUserId: string) {
  try {
    const user = await requireUser(idToken);
    await prisma.userblock.deleteMany({
      where: { blockerId: user.id, blockedId: targetUserId }
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al desbloquear al usuario") };
  }
}

export async function checkIsBlocked(idToken: string, targetUserId: string) {
  try {
    const user = await requireUser(idToken);
    const count = await prisma.userblock.count({
      where: {
        OR: [
          { blockerId: user.id, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: user.id },
        ]
      }
    });
    return { success: true as const, isBlocked: count > 0 };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al verificar bloqueo"), isBlocked: false };
  }
}
