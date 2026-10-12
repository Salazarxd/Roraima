"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";
import { TradeRuleError } from "@/lib/ledger";
import { isValidTronAddress } from "@/lib/tron";
import { verifyTotpWithRateLimit } from "@/lib/two-factor-guard";
import * as OTPAuth from "otpauth";

export async function getWhitelist(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const addresses = await prisma.whitelistaddress.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return { 
      success: true as const, 
      addresses: addresses.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })), 
      whitelistEnabled: user.whitelistEnabled, 
      twoFactorEnabled: user.twoFactorEnabled 
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al cargar la whitelist") };
  }
}

export async function addWhitelistAddress(idToken: string, label: string, address: string, twoFactorCode?: string) {
  try {
    const user = await requireUser(idToken);
    
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) throw new TradeRuleError("Se requiere código 2FA");
      if (!user.twoFactorSecret) throw new TradeRuleError("Error de configuración 2FA");
      verifyTotpWithRateLimit(user.id, user.twoFactorSecret, twoFactorCode, user.email);
    }

    const cleanLabel = label.trim().slice(0, 50);
    const cleanAddress = address.trim();

    if (!cleanLabel || !cleanAddress) {
      throw new TradeRuleError("La etiqueta y la dirección son obligatorias");
    }

    if (!isValidTronAddress(cleanAddress)) {
      throw new TradeRuleError("Dirección TRON (TRC20) inválida. Debe comenzar con 'T' y tener 34 caracteres.");
    }

    const existing = await prisma.whitelistaddress.findFirst({
      where: { userId: user.id, address: cleanAddress }
    });

    if (existing) {
      throw new TradeRuleError("Esta dirección ya está en tu lista blanca");
    }

    await prisma.whitelistaddress.create({
      data: {
        userId: user.id,
        label: cleanLabel,
        address: cleanAddress,
      }
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al agregar dirección") };
  }
}

export async function removeWhitelistAddress(idToken: string, addressId: string, twoFactorCode?: string) {
  try {
    const user = await requireUser(idToken);

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) throw new TradeRuleError("Se requiere código 2FA");
      if (!user.twoFactorSecret) throw new TradeRuleError("Error de configuración 2FA");
      verifyTotpWithRateLimit(user.id, user.twoFactorSecret, twoFactorCode, user.email);
    }

    await prisma.whitelistaddress.deleteMany({
      where: { id: addressId, userId: user.id },
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al eliminar dirección") };
  }
}

export async function toggleWhitelist(idToken: string, enable: boolean, twoFactorCode?: string) {
  try {
    const user = await requireUser(idToken);

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) throw new TradeRuleError("Se requiere código 2FA");
      if (!user.twoFactorSecret) throw new TradeRuleError("Error de configuración 2FA");
      verifyTotpWithRateLimit(user.id, user.twoFactorSecret, twoFactorCode, user.email);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { whitelistEnabled: enable },
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al cambiar configuración") };
  }
}
