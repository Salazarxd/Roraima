"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";
import { TradeRuleError } from "@/lib/ledger";
import { assertProfileComplete, docDigits, KYC_DOCUMENT_TYPES, type KycDocumentType } from "@/lib/profile";
import { ocrDocumentNumbers } from "@/lib/ocr";

const MAX_BYTES = 8 * 1024 * 1024;
const KINDS = ["FRONT", "BACK", "SELFIE"] as const;

/** Tipo REAL de la imagen según sus bytes mágicos. */
function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

/**
 * Recibe las 3 fotos del KYC (frente, dorso y selfie), las guarda FUERA de /public
 * (`private_uploads/kyc/<uid>/`) para que nadie pueda acceder por URL, y deja el perfil
 * en estado PENDING para revisión del equipo de cumplimiento.
 */
export async function submitKycDocuments(formData: FormData) {
  try {
    const user = await requireUser(formData.get("idToken") as string);
    if (user.kycStatus === "VERIFIED") return { success: true as const };
    assertProfileComplete(user);
    if (user.kycStatus === "PENDING") {
      const existing = await prisma.kycdocument.count({ where: { userId: user.id } });
      if (existing >= 3) throw new TradeRuleError("Ya tienes documentos en revisión. Te avisaremos cuando terminemos.");
    }

    // Documento: cédula, pasaporte o licencia. Los tres llevan el MISMO número de cédula,
    // y debe coincidir con el registrado en el perfil (es la llave que luego exigimos en las cuentas bancarias).
    const documentType = String(formData.get("documentType") ?? "") as KycDocumentType;
    if (!Object.hasOwn(KYC_DOCUMENT_TYPES, documentType)) throw new TradeRuleError("Selecciona el tipo de documento (cédula, pasaporte o licencia)");
    const declared = docDigits(formData.get("documentNumber") as string);
    const profileDoc = docDigits(user.document);
    if (!declared) throw new TradeRuleError("Escribe el número de cédula que aparece en tu documento");
    if (declared !== profileDoc) {
      throw new TradeRuleError(
        `El número de tu ${KYC_DOCUMENT_TYPES[documentType].toLowerCase()} (${declared}) no coincide con la cédula de tu perfil (${profileDoc}). Corrígelo en tu perfil o usa el documento correcto.`
      );
    }

    const files: { kind: (typeof KINDS)[number]; buf: Buffer; type: { ext: string; mime: string } }[] = [];
    for (const kind of KINDS) {
      const f = formData.get(kind.toLowerCase());
      if (!(f instanceof File) || f.size === 0) throw new TradeRuleError("Faltan fotos del documento");
      if (f.size > MAX_BYTES) throw new TradeRuleError("Cada foto debe pesar menos de 8 MB");
      const buf = Buffer.from(await f.arrayBuffer());
      const type = sniffImage(buf);
      if (!type) throw new TradeRuleError("Solo se aceptan fotos JPG, PNG o WEBP");
      files.push({ kind, buf, type });
    }

    // Una cédula = una cuenta. Primero por lo declarado...
    const taken = await prisma.user.findFirst({ where: { documentNumber: declared, id: { not: user.id } }, select: { id: true } });
    if (taken) throw new TradeRuleError("Esta cédula ya está registrada en otra cuenta. Si es tuya, contacta a soporte.");

    // ...y luego por lo que REALMENTE dice la foto (OCR en el servidor sobre frente y dorso)
    const detected = await ocrDocumentNumbers(files.filter((f) => f.kind !== "SELFIE").map((f) => f.buf));
    if (detected?.length) {
      const clash = await prisma.user.findFirst({ where: { documentNumber: { in: detected }, id: { not: user.id } }, select: { documentNumber: true } });
      if (clash) {
        throw new TradeRuleError(
          `El documento de la foto (cédula ${clash.documentNumber}) ya pertenece a otra cuenta. No se permiten varias cuentas con la misma cédula.`
        );
      }
    }
    const ocrStatus = detected === null || detected.length === 0 ? "UNREADABLE" : detected.includes(declared) ? "MATCH" : "MISMATCH";

    const fs = await import("fs/promises");
    const path = await import("path");
    const crypto = await import("crypto");
    const dir = path.join(process.cwd(), "private_uploads", "kyc", user.id);
    await fs.mkdir(dir, { recursive: true });

    const rows = [];
    for (const f of files) {
      const name = `${f.kind.toLowerCase()}-${crypto.randomUUID()}.${f.type.ext}`;
      await fs.writeFile(path.join(dir, name), f.buf);
      rows.push({ userId: user.id, kind: f.kind, path: `${user.id}/${name}`, mime: f.type.mime });
    }

    await prisma.$transaction([
      prisma.kycdocument.createMany({ data: rows }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          kycStatus: "PENDING",
          documentType,
          documentNumber: declared,
          kycOcrStatus: ocrStatus,
          kycOcrNumbers: detected?.length ? detected.join(", ").slice(0, 255) : null,
        },
      }),
    ]);
    return { success: true as const, ocrStatus };
  } catch (error) {
    console.error("KYC upload error:", error);
    // Carrera: otra cuenta guardó la misma cédula un instante antes (índice único)
    if ((error as { code?: string })?.code === "P2002") {
      return { success: false as const, error: "Esta cédula ya está registrada en otra cuenta. Si es tuya, contacta a soporte." };
    }
    return { success: false as const, error: toClientError(error, "No se pudieron enviar los documentos") };
  }
}

/** Estado actual de KYC del usuario. */
export async function getKycStatus(idToken: string) {
  try {
    const user = await requireUser(idToken);
    return { success: true as const, status: user.kycStatus };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo cargar el estado"), status: null };
  }
}
