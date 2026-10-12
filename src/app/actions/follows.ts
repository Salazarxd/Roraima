"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";
import { TradeRuleError } from "@/lib/ledger";

function publicMerchantName(u: { name?: string | null; firstName?: string | null; lastName?: string | null; email: string }) {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (u.name && u.name.trim()) return u.name.trim();
  return u.email.split("@")[0];
}

/** Seguir a un comerciante P2P y configurar notificaciones automáticas */
export async function followMerchant(idToken: string, targetUserId: string, notifyOnAd: boolean = true) {
  try {
    const user = await requireUser(idToken);
    if (user.id === targetUserId) {
      throw new TradeRuleError("No puedes seguir tu propia cuenta");
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, email: true },
    });
    if (!target) throw new TradeRuleError("Comerciante no encontrado");

    const follow = await prisma.userfollow.upsert({
      where: { followerId_followingId: { followerId: user.id, followingId: targetUserId } },
      create: { followerId: user.id, followingId: targetUserId, notifyOnAd },
      update: { notifyOnAd },
    });

    const followersCount = await prisma.userfollow.count({ where: { followingId: targetUserId } });

    return {
      success: true as const,
      isFollowing: true,
      notifyOnAd: follow.notifyOnAd,
      followersCount,
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo seguir al usuario") };
  }
}

/** Dejar de seguir a un comerciante */
export async function unfollowMerchant(idToken: string, targetUserId: string) {
  try {
    const user = await requireUser(idToken);
    await prisma.userfollow.deleteMany({
      where: { followerId: user.id, followingId: targetUserId },
    });

    const followersCount = await prisma.userfollow.count({ where: { followingId: targetUserId } });

    return {
      success: true as const,
      isFollowing: false,
      notifyOnAd: false,
      followersCount,
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo dejar de seguir al usuario") };
  }
}

/** Activar / desactivar las alertas cuando el comerciante publica anuncios */
export async function toggleFollowNotification(idToken: string, targetUserId: string, notifyOnAd?: boolean) {
  try {
    const user = await requireUser(idToken);
    if (user.id === targetUserId) throw new TradeRuleError("Operación inválida");

    const existing = await prisma.userfollow.findUnique({
      where: { followerId_followingId: { followerId: user.id, followingId: targetUserId } },
    });

    let resultNotify = true;

    if (!existing) {
      const created = await prisma.userfollow.create({
        data: {
          followerId: user.id,
          followingId: targetUserId,
          notifyOnAd: notifyOnAd ?? true,
        },
      });
      resultNotify = created.notifyOnAd;
    } else {
      const nextVal = notifyOnAd !== undefined ? notifyOnAd : !existing.notifyOnAd;
      const updated = await prisma.userfollow.update({
        where: { id: existing.id },
        data: { notifyOnAd: nextVal },
      });
      resultNotify = updated.notifyOnAd;
    }

    return {
      success: true as const,
      isFollowing: true,
      notifyOnAd: resultNotify,
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo actualizar la preferencia de notificación") };
  }
}

/** Obtener estado de seguimiento respecto a un usuario */
export async function getFollowStatus(idToken: string, targetUserId: string) {
  try {
    const user = await requireUser(idToken);
    const isSelf = user.id === targetUserId;

    const [follow, followersCount] = await Promise.all([
      prisma.userfollow.findUnique({
        where: { followerId_followingId: { followerId: user.id, followingId: targetUserId } },
      }),
      prisma.userfollow.count({ where: { followingId: targetUserId } }),
    ]);

    return {
      success: true as const,
      isSelf,
      isFollowing: Boolean(follow),
      notifyOnAd: follow?.notifyOnAd ?? false,
      followersCount,
    };
  } catch (error) {
    return {
      success: false as const,
      error: toClientError(error, "No se pudo consultar el estado"),
      isSelf: false,
      isFollowing: false,
      notifyOnAd: false,
      followersCount: 0,
    };
  }
}

export type FollowedMerchantItem = {
  id: string;
  name: string;
  email: string;
  kycStatus: string;
  isVip: boolean;
  memberSince: string;
  followedAt: string;
  notifyOnAd: boolean;
  activeAdsCount: number;
  activeAds: { id: string; type: string; price: number; amount: number }[];
};

/** Obtener la lista de comerciantes seguidos por el usuario para el Centro de Usuario */
export async function getFollowedMerchants(idToken: string) {
  try {
    const user = await requireUser(idToken);

    const follows = await prisma.userfollow.findMany({
      where: { followerId: user.id },
      include: {
        following: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
            kycStatus: true,
            vipUntil: true,
            createdAt: true,
            p2porder: {
              where: { status: "OPEN", amount: { gt: 0 } },
              select: { id: true, type: true, price: true, amount: true },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = Date.now();
    const merchants: FollowedMerchantItem[] = follows.map((f) => ({
      id: f.following.id,
      name: publicMerchantName(f.following),
      email: f.following.email,
      kycStatus: f.following.kycStatus,
      isVip: Boolean(f.following.vipUntil && new Date(f.following.vipUntil).getTime() > now),
      memberSince: f.following.createdAt.toISOString(),
      followedAt: f.createdAt.toISOString(),
      notifyOnAd: f.notifyOnAd,
      activeAdsCount: f.following.p2porder.length,
      activeAds: f.following.p2porder,
    }));

    return {
      success: true as const,
      merchants,
    };
  } catch (error) {
    return {
      success: false as const,
      error: toClientError(error, "No se pudieron obtener los comerciantes seguidos"),
      merchants: [] as FollowedMerchantItem[],
    };
  }
}
