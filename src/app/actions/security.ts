"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

import { verifyTotpWithRateLimit } from "@/lib/two-factor-guard";

export async function generate2FA(idToken: string) {
  try {
    const user = await requireUser(idToken);
    
    if (user.twoFactorEnabled) {
      return { success: false as const, error: "La autenticación de dos factores ya está habilitada" };
    }

    // Generate new secret
    const totp = new OTPAuth.TOTP({
      issuer: "Roraima Exchange",
      label: user.email || "Usuario",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: new OTPAuth.Secret({ size: 20 }),
    });

    const secret = totp.secret.base32;
    const otpauth = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    // Save secret to user, but don't enable it yet
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret },
    });

    return { success: true as const, qrDataUrl, secret };
  } catch (error) {
    console.error("Error generating 2FA:", error);
    return { success: false as const, error: toClientError(error, "Error al generar 2FA") };
  }
}

export async function verifyAndEnable2FA(idToken: string, token: string) {
  try {
    const user = await requireUser(idToken);
    
    if (user.twoFactorEnabled) {
      return { success: false as const, error: "El 2FA ya está habilitado" };
    }

    if (!user.twoFactorSecret) {
      return { success: false as const, error: "Debes generar el 2FA primero" };
    }

    verifyTotpWithRateLimit(user.id, user.twoFactorSecret, token, user.email);

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });

    return { success: true as const };
  } catch (error) {
    console.error("Error enabling 2FA:", error);
    return { success: false as const, error: toClientError(error, "Error al habilitar 2FA") };
  }
}

export async function disable2FA(idToken: string, token: string) {
  try {
    const user = await requireUser(idToken);
    
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return { success: false as const, error: "El 2FA no está habilitado" };
    }

    verifyTotpWithRateLimit(user.id, user.twoFactorSecret, token, user.email);

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    return { success: true as const };
  } catch (error) {
    console.error("Error disabling 2FA:", error);
    return { success: false as const, error: toClientError(error, "Error al deshabilitar 2FA") };
  }
}

/** Verifica si una cuenta tiene 2FA activado tras identificarse */
export async function checkUser2FAStatus(idToken: string) {
  try {
    const user = await requireUser(idToken);
    return { success: true as const, twoFactorEnabled: !!user.twoFactorEnabled };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al verificar 2FA"), twoFactorEnabled: false };
  }
}

/** Valida el código 2FA en el proceso de inicio de sesión */
export async function validateLogin2FA(idToken: string, code: string) {
  try {
    const user = await requireUser(idToken);
    if (!user.twoFactorEnabled) return { success: true as const };
    if (!user.twoFactorSecret) throw new Error("Error en la configuración de 2FA");
    verifyTotpWithRateLimit(user.id, user.twoFactorSecret, code, user.email);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Código 2FA incorrecto o expirado") };
  }
}
