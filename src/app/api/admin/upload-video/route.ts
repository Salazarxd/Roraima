import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const idToken = (formData.get("idToken") as string) || req.headers.get("authorization")?.replace("Bearer ", "");
    
    // Validar autorización de administrador
    await requireAdmin(idToken);

    const file = formData.get("file") as File | null;
    const deviceType = (formData.get("deviceType") as string) === "mobile" ? "mobile" : "desktop";

    if (!file) {
      return NextResponse.json({ success: false, error: "No se proporcionó ningún archivo de video." }, { status: 400 });
    }

    // Validar tipo de archivo
    const validMimes = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/ogg"];
    const fileExt = path.extname(file.name).toLowerCase() || ".mp4";
    const allowedExts = [".mp4", ".webm", ".mov", ".m4v", ".ogv"];

    if (!validMimes.includes(file.type) && !allowedExts.includes(fileExt)) {
      return NextResponse.json(
        { success: false, error: "Formato no compatible. Por favor sube un video MP4, WebM o MOV." },
        { status: 400 }
      );
    }

    // Límite de tamaño: 100 MB
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el tamaño máximo permitido de 100 MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verificación estricta de bytes mágicos de contenedor de video
    const isMp4OrMov =
      buffer.length >= 8 &&
      (buffer.subarray(4, 8).toString("ascii") === "ftyp" ||
        buffer.subarray(4, 8).toString("ascii") === "moov" ||
        buffer.subarray(4, 8).toString("ascii") === "mdat");
    const isWebm =
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3;
    const isOgg =
      buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "OggS";

    if (!isMp4OrMov && !isWebm && !isOgg) {
      return NextResponse.json(
        { success: false, error: "El archivo no es un contenedor de video válido (firma de video inválida)." },
        { status: 400 }
      );
    }

    const videosDir = path.join(process.cwd(), "public", "videos");
    await fs.mkdir(videosDir, { recursive: true });

    // Guardar con nombre seguro y timestamp
    const cleanExt = isWebm ? ".webm" : isOgg ? ".ogv" : ".mp4";
    const fileName = `intro-${deviceType}-${Date.now()}${cleanExt}`;
    const filePath = path.join(videosDir, fileName);

    await fs.writeFile(filePath, buffer);

    const url = `/videos/${fileName}`;

    return NextResponse.json({
      success: true,
      url,
      fileName,
      deviceType,
      size: file.size,
    });
  } catch (error: any) {
    console.error("Error al subir video de intro:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error al procesar la subida del video." },
      { status: 500 }
    );
  }
}
