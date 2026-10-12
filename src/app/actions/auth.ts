"use server";

import prisma from "@/lib/prisma";
import { verifyIdToken, toClientError } from "@/lib/server-auth";
import { normalizeDocument } from "@/lib/profile";

export async function syncUserToDatabase({
  idToken,
  name,
  document,
  referralCode,
}: {
  idToken: string;
  name: string;
  document: string;
  referralCode?: string;
}) {
  try {
    // uid y email salen del token verificado, nunca del cliente
    const identity = await verifyIdToken(idToken);
    if (!identity.email) return { success: false, error: "La cuenta no tiene un correo asociado" };

    const cleanName = String(name ?? "").trim().slice(0, 120) || null;
    const rawDoc = String(document ?? "").trim();
    const norm = rawDoc ? normalizeDocument(rawDoc) : null;
    if (rawDoc && !norm) return { success: false, error: "Cédula no válida (ej. V-12345678)", code: "INVALID_DOCUMENT" as const };

    const current = await prisma.user.findUnique({ where: { id: identity.uid }, select: { document: true, referralCode: true, referredById: true } });
    // La cédula solo se fija una vez (al registrarse). Nunca se sobrescribe desde aquí.
    const setDoc = norm && !current?.document ? norm : null;
    if (setDoc) {
      const taken = await prisma.user.count({ where: { documentNumber: setDoc.digits, id: { not: identity.uid } } });
      if (taken) {
        return { success: false, error: "Esta cédula ya está registrada en otra cuenta. Inicia sesión con esa cuenta o contacta a soporte.", code: "DUPLICATE_DOCUMENT" as const };
      }
    }

    // Identificar referente si aplica
    let referrerId: string | null = null;
    if (referralCode && !current?.referredById) {
      const cleanRefCode = referralCode.trim().toUpperCase();
      const referrer = await prisma.user.findFirst({
        where: { referralCode: cleanRefCode, id: { not: identity.uid } },
        select: { id: true },
      });
      if (referrer) {
        referrerId = referrer.id;
      }
    }

    const generatedCode = current?.referralCode || `RORAIMA-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // We use upsert to avoid crashing if the user already exists
    await prisma.user.upsert({
      where: { id: identity.uid },
      update: {
        ...(cleanName ? { name: cleanName } : {}),
        ...(setDoc ? { document: setDoc.doc, documentNumber: setDoc.digits } : {}),
        ...(referrerId && !current?.referredById ? { referredById: referrerId } : {}),
        ...(!current?.referralCode ? { referralCode: generatedCode } : {}),
      },
      create: {
        id: identity.uid,
        email: identity.email,
        name: cleanName,
        document: setDoc?.doc ?? null,
        documentNumber: setDoc?.digits ?? null,
        referralCode: generatedCode,
        referredById: referrerId,
      },
    });

    // 1. Garantizar billeteras para USDT y USDC
    const [usdtWallet, usdcWallet] = await Promise.all([
      prisma.wallet.findFirst({ where: { userId: identity.uid, currency: "USDT" } }),
      prisma.wallet.findFirst({ where: { userId: identity.uid, currency: "USDC" } }),
    ]);

    if (!usdtWallet) {
      await prisma.wallet.create({
        data: { userId: identity.uid, currency: "USDT", balance: 0.0 },
      });
    }

    if (!usdcWallet) {
      await prisma.wallet.create({
        data: { userId: identity.uid, currency: "USDC", balance: 0.0 },
      });
    }

    // 2. Pre-generar y asignar automáticamente su dirección HD de depósito en TRON
    try {
      const { getOrCreateUserDepositAddress } = await import("@/lib/hd-wallet");
      await getOrCreateUserDepositAddress(identity.uid, "TRC20", "USDT");
    } catch (e) {
      console.error("Error pre-generando dirección HD de depósito:", e);
    }

    return { success: true };
  } catch (error) {
    console.error("Database sync error:", error);
    if ((error as { code?: string })?.code === "P2002") {
      return { success: false, error: "Esta cédula ya está registrada en otra cuenta.", code: "DUPLICATE_DOCUMENT" as const };
    }
    return { success: false, error: toClientError(error, "Error al guardar el usuario en la base de datos") };
  }
}
