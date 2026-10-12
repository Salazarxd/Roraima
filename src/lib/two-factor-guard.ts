import "server-only";
import { TradeRuleError } from "@/lib/ledger";
import * as OTPAuth from "otpauth";

type AttemptRecord = {
  failures: number;
  lockedUntil: number | null;
  lastAttempt: number;
};

const MAX_FAILURES = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutos de bloqueo tras 5 intentos fallidos
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // Ventana de 10 minutos

const attemptsMap = new Map<string, AttemptRecord>();

// Limpieza periódica de registros obsoletos cada 15 minutos
setInterval(() => {
  const now = Date.now();
  for (const [userId, record] of attemptsMap.entries()) {
    if (now - record.lastAttempt > ATTEMPT_WINDOW_MS && (!record.lockedUntil || now > record.lockedUntil)) {
      attemptsMap.delete(userId);
    }
  }
}, 15 * 60 * 1000).unref();

/**
 * Valida un código 2FA TOTP con protección contra ataques de fuerza bruta.
 * Si se detectan 5 intentos fallidos, bloquea temporalmente las validaciones de 2FA para el usuario.
 */
export function verifyTotpWithRateLimit(
  userId: string,
  secretBase32: string,
  userToken: string,
  userEmail?: string | null
): boolean {
  const now = Date.now();
  const record = attemptsMap.get(userId) || {
    failures: 0,
    lockedUntil: null,
    lastAttempt: now,
  };

  // Verificar si el usuario está actualmente bloqueado por fuerza bruta
  if (record.lockedUntil && now < record.lockedUntil) {
    const minutesLeft = Math.ceil((record.lockedUntil - now) / 60000);
    throw new TradeRuleError(
      `Demasiados intentos incorrectos de 2FA. Por seguridad, espera ${minutesLeft} minuto(s) antes de intentar nuevamente.`
    );
  }

  // Si el bloqueo previo ya pasó, reiniciar contador
  if (record.lockedUntil && now >= record.lockedUntil) {
    record.failures = 0;
    record.lockedUntil = null;
  }

  const cleanToken = String(userToken ?? "").trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanToken)) {
    record.failures += 1;
    record.lastAttempt = now;
    if (record.failures >= MAX_FAILURES) {
      record.lockedUntil = now + LOCKOUT_MS;
      attemptsMap.set(userId, record);
      throw new TradeRuleError(
        "Demasiados intentos incorrectos de 2FA. Acceso bloqueado temporalmente por 5 minutos."
      );
    }
    attemptsMap.set(userId, record);
    throw new TradeRuleError("El código 2FA debe tener exactamente 6 dígitos numéricos.");
  }

  const totp = new OTPAuth.TOTP({
    issuer: "Roraima Exchange",
    label: userEmail || "Usuario",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const delta = totp.validate({ token: cleanToken, window: 1 });

  if (delta === null) {
    record.failures += 1;
    record.lastAttempt = now;
    if (record.failures >= MAX_FAILURES) {
      record.lockedUntil = now + LOCKOUT_MS;
      attemptsMap.set(userId, record);
      throw new TradeRuleError(
        "Demasiados intentos incorrectos de 2FA. Por tu seguridad, las operaciones 2FA se han bloqueado por 5 minutos."
      );
    }
    attemptsMap.set(userId, record);
    const remaining = MAX_FAILURES - record.failures;
    throw new TradeRuleError(
      `Código 2FA incorrecto o expirado. Intentos restantes antes de bloqueo temporal: ${remaining}.`
    );
  }

  // Éxito: limpiar registros de intentos fallidos para este usuario
  attemptsMap.delete(userId);
  return true;
}
