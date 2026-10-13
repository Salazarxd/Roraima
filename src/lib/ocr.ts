import "server-only";
import path from "path";
import type { Worker } from "tesseract.js";

/**
 * OCR del KYC: lee las fotos del documento (cédula, pasaporte o licencia) y extrae los
 * números con forma de cédula. Corre en el servidor (el cliente no puede falsear el resultado).
 *
 * - Preprocesa con sharp (orientación EXIF, escala de grises, contraste, nitidez) para fotos de móvil.
 * - Un solo worker reutilizado en todo el proceso (crear uno cuesta ~1-2 s).
 * - La primera vez descarga el idioma (eng) y lo guarda en `.cache/tesseract`.
 */

const g = globalThis as unknown as { __roraimaOcrWorker?: Promise<Worker> };
const OCR_TIMEOUT_MS = 10_000;

function getWorker(): Promise<Worker> {
  if (!g.__roraimaOcrWorker) {
    g.__roraimaOcrWorker = (async () => {
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        cachePath: path.join(process.cwd(), ".cache", "tesseract"),
      });
      // SPARSE_TEXT: los documentos tienen texto disperso (no párrafos)
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return worker;
    })().catch((e) => {
      g.__roraimaOcrWorker = undefined; // reintentar en la próxima llamada
      throw e;
    });
  }
  return g.__roraimaOcrWorker;
}

async function preprocess(buf: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buf)
      .rotate() // respeta la orientación EXIF de la cámara
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    return buf; // sin sharp: usar la imagen original
  }
}

/**
 * Extrae candidatos a número de cédula del texto: "V-23.684.976", "V 23684976", "23.684.976", "23684976".
 * Las fechas (12.05.1990) no califican porque los grupos no son de 3 dígitos.
 */
export function extractDocNumbers(text: string): string[] {
  const out = new Set<string>();
  const t = text.toUpperCase().replace(/[|]/g, "1");
  const re = /(?<![\d.])(\d{1,3}(?:[.,\s]\d{3}){1,2}|\d{6,10})(?![\d])/g;
  for (const m of t.matchAll(re)) {
    const digits = m[1].replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length >= 6 && digits.length <= 10) out.add(digits);
  }
  return [...out];
}

/**
 * Lee varias imágenes y devuelve los números detectados.
 * `null` = el motor OCR no pudo ejecutarse (sin red para descargar el idioma, timeout…):
 * en ese caso el KYC sigue, pero marcado para revisión manual.
 */
export async function ocrDocumentNumbers(images: Buffer[]): Promise<string[] | null> {
  try {
    const worker = await getWorker();
    const all = new Set<string>();
    for (const img of images) {
      const job = preprocess(img).then((b) => worker.recognize(b));
      const res = await Promise.race([
        job,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("OCR timeout")), OCR_TIMEOUT_MS)),
      ]);
      for (const n of extractDocNumbers(res.data.text ?? "")) all.add(n);
    }
    return [...all];
  } catch (e) {
    console.error("[ocr] error:", e);
    return null;
  }
}
