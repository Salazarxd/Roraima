import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import prisma from "@/lib/prisma";

/**
 * Verificación de identidad en el servidor.
 *
 * NUNCA confiar en un `userId` enviado por el cliente: cualquiera puede invocar una
 * Server Action con parámetros arbitrarios. En su lugar, el cliente envía su Firebase
 * ID Token y aquí verificamos la firma contra las claves públicas de Google.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export class AuthError extends Error {
  constructor(message = "No autorizado") {
    super(message);
    this.name = "AuthError";
  }
}

export type VerifiedIdentity = { uid: string; email: string | null; emailVerified: boolean };

export async function verifyIdToken(idToken: string | undefined | null): Promise<VerifiedIdentity> {
  if (!idToken || typeof idToken !== "string") throw new AuthError("Sesión no válida. Inicia sesión de nuevo.");
  if (!PROJECT_ID) throw new AuthError("Configuración de autenticación incompleta en el servidor.");

  try {
    const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
      algorithms: ["RS256"],
    });
    if (!payload.sub) throw new AuthError();
    return {
      uid: payload.sub,
      email: (payload.email as string | undefined) ?? null,
      emailVerified: Boolean(payload.email_verified),
    };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError("Tu sesión expiró. Inicia sesión de nuevo.");
  }
}

/** Verifica el token y devuelve el usuario de la base de datos. */
export async function requireUser(idToken: string | undefined | null) {
  const identity = await verifyIdToken(idToken);
  const user = await prisma.user.findUnique({ where: { id: identity.uid } });
  if (!user) throw new AuthError("Usuario no registrado en la plataforma.");
  if (user.role === "BANNED" || user.status === "SUSPENDED") {
    throw new AuthError("Tu cuenta está suspendida. Contacta a soporte.");
  }
  return user;
}

export const STAFF_ROLES = ["ADMIN", "SUPPORT"] as const;

/** Verifica que el usuario tenga rol ADMIN o SUPPORT (RBAC). */
export async function requireStaff(idToken: string | undefined | null) {
  const user = await requireUser(idToken);
  if (!(STAFF_ROLES as readonly string[]).includes(user.role)) {
    throw new AuthError("Acceso restringido al equipo de Roraima.");
  }
  return user;
}

/**
 * Solo ADMIN. El rol SUPPORT atiende casos pero NO ejecuta decisiones: las propone y un
 * administrador las aprueba (principio de doble control / "four-eyes").
 */
export async function requireAdmin(idToken: string | undefined | null) {
  const user = await requireUser(idToken);
  if (user.role !== "ADMIN") throw new AuthError("Esta acción requiere rol de Administrador.");
  return user;
}

/** Convierte cualquier error en un mensaje seguro para el cliente (sin filtrar detalles internos). */
export function toClientError(error: unknown, fallback: string): string {
  if (error instanceof AuthError) return error.message;
  if (error instanceof Error && error.name === "TradeRuleError") return error.message;
  return fallback;
}
