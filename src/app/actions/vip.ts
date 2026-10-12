"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";
import { TradeRuleError, debit } from "@/lib/ledger";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

const MAX_BYTES = 8 * 1024 * 1024;

function sniffDocument(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return { ext: "pdf", mime: "application/pdf" };
  return null;
}

export async function purchaseVipMembership(formData: FormData) {
  try {
    const user = await requireUser(formData.get("idToken") as string);
    if (user.kycStatus !== "VERIFIED") throw new TradeRuleError("Debes verificar tu identidad (KYC Básico) primero.");
    
    // Validar archivos
    const rifFile = formData.get("rif");
    const bankFile = formData.get("bankRef");
    
    if (!(rifFile instanceof File) || rifFile.size === 0) throw new TradeRuleError("Sube el comprobante de RIF");
    if (rifFile.size > MAX_BYTES) throw new TradeRuleError("El RIF pesa más de 8MB");
    
    if (!(bankFile instanceof File) || bankFile.size === 0) throw new TradeRuleError("Sube la Referencia Bancaria");
    if (bankFile.size > MAX_BYTES) throw new TradeRuleError("La Referencia Bancaria pesa más de 8MB");

    const rifBuf = Buffer.from(await rifFile.arrayBuffer());
    const bankBuf = Buffer.from(await bankFile.arrayBuffer());

    const rifType = sniffDocument(rifBuf);
    if (!rifType) throw new TradeRuleError("El RIF debe ser una imagen (JPG, PNG, WEBP) o PDF válido");

    const bankType = sniffDocument(bankBuf);
    if (!bankType) throw new TradeRuleError("La Referencia Bancaria debe ser una imagen (JPG, PNG, WEBP) o PDF válido");

    // Guardar archivos en private_uploads/kyc/<userId> para compatibilidad con el visor de staff
    const dir = path.join(process.cwd(), "private_uploads", "kyc", user.id);
    await fs.mkdir(dir, { recursive: true });
    
    const rifFileName = `rif-${crypto.randomUUID()}.${rifType.ext}`;
    const bankFileName = `bank-${crypto.randomUUID()}.${bankType.ext}`;
    
    await fs.writeFile(path.join(dir, rifFileName), rifBuf);
    await fs.writeFile(path.join(dir, bankFileName), bankBuf);

    // Cobrar e impactar BD
    return await prisma.$transaction(async (tx) => {
      const success = await debit(tx, user.id, 25, { 
        type: "FEE", 
        note: "Suscripción Comerciante VIP (Membresía Mensual)" 
      });
      if (!success) throw new TradeRuleError("Saldo USDT insuficiente. Necesitas 25 USDT en tu cuenta.");
      
      const now = new Date();
      let base = now;
      if (user.vipUntil && user.vipUntil.getTime() > now.getTime()) {
        base = user.vipUntil;
      }
      const newVipUntil = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      await tx.user.update({
        where: { id: user.id },
        data: { vipUntil: newVipUntil }
      });
      
      // Guardar registro de los documentos L2 (usando kycdocument con ruta relativa segura)
      await tx.kycdocument.createMany({
        data: [
          { userId: user.id, kind: "RIF", path: `${user.id}/${rifFileName}`, mime: rifType.mime },
          { userId: user.id, kind: "BANK_REF", path: `${user.id}/${bankFileName}`, mime: bankType.mime },
        ]
      });
      
      return { success: true as const, newVipUntil: newVipUntil.toISOString() };
    }, { timeout: 15000 });
    
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo procesar la membresía VIP") };
  }
}
