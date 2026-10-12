import "server-only";
import { TradeRuleError } from "@/lib/ledger";

/**
 * Datos personales OBLIGATORIOS para operar (P2P, anuncios, retiros, transferencias y KYC).
 * Igual que en Binance: sin identidad completa no hay operaciones.
 */
export const REQUIRED_PROFILE_FIELDS = [
  { key: "firstName", label: "Nombres" },
  { key: "lastName", label: "Apellidos" },
  { key: "document", label: "Documento de identidad" },
  { key: "phone", label: "Teléfono" },
  { key: "address", label: "Dirección" },
] as const;

type ProfileLike = { firstName: string | null; lastName: string | null; document: string | null; phone: string | null; address: string | null };

export function missingProfileFields(u: ProfileLike): string[] {
  return REQUIRED_PROFILE_FIELDS.filter((f) => !String(u[f.key] ?? "").trim()).map((f) => f.label);
}

export function assertProfileComplete(u: ProfileLike) {
  const missing = missingProfileFields(u);
  if (missing.length) {
    throw new TradeRuleError(`Completa tu información personal antes de continuar (Perfil → ${missing.join(", ")}).`);
  }
}

// ============================================================================
//  IDENTIDAD KYC: el número de cédula es la llave que une KYC y cuentas bancarias
// ============================================================================

export const KYC_DOCUMENT_TYPES = { CEDULA: "Cédula de identidad", PASAPORTE: "Pasaporte", LICENCIA: "Licencia de conducir" } as const;
export type KycDocumentType = keyof typeof KYC_DOCUMENT_TYPES;

/** Solo los dígitos del documento ("V-23.684.976" -> "23684976"). */
export const docDigits = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/**
 * Normaliza lo que escribe el usuario: "23.684.976", "v23684976", "V-23684976" -> { doc: "V-23684976", digits: "23684976" }.
 * Sin letra se asume V (venezolano). Devuelve null si el formato no es válido.
 */
export function normalizeDocument(raw: unknown): { doc: string; digits: string } | null {
  const s = String(raw ?? "").toUpperCase().replace(/[\s.]/g, "").slice(0, 20);
  const m = s.match(/^([VEJPG])?-?(\d{5,10})$/);
  if (!m) return null;
  const digits = m[2].replace(/^0+/, "") || m[2];
  return { doc: `${m[1] ?? "V"}-${digits}`, digits };
}

/** Nombre legal completo tal como quedó verificado en el KYC. */
export const kycFullName = (u: { firstName: string | null; lastName: string | null; name?: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || (u.name ?? "").trim();
