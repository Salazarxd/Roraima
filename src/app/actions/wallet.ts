"use server";

import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/server-auth";

export async function getUserWallets(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const wallets = await prisma.wallet.findMany({
      where: { userId: user.id }
    });
    return { success: true, wallets };
  } catch (error) {
    console.error("Error fetching wallets:", error);
    return { success: false, wallets: [] };
  }
}
