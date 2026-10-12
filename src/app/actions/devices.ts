"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";

export interface DeviceInfo {
  id: string;
  deviceName: string;
  browser: string;
  os: string;
  ip: string | null;
  isTrusted: boolean;
  lastActiveAt: string;
  createdAt: string;
}

/** Registra el latido / presencia del usuario y actualiza o registra el dispositivo actual */
export async function recordDeviceHeartbeat(
  idToken: string,
  info: {
    deviceName?: string;
    browser?: string;
    os?: string;
    ip?: string;
  }
) {
  try {
    const user = await requireUser(idToken);
    const now = new Date();

    // 1. Actualizar presencia / tiempo en línea del usuario
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: now },
    });

    const browser = (info.browser || "Navegador Web").slice(0, 50);
    const os = (info.os || "Sistema Operativo").slice(0, 50);
    const deviceName = (info.deviceName || `${browser} en ${os}`).slice(0, 100);
    const ip = info.ip ? info.ip.slice(0, 45) : null;

    // 2. Buscar si este dispositivo ya está registrado para este usuario
    const existing = await prisma.userdevice.findFirst({
      where: {
        userId: user.id,
        browser,
        os,
      },
    });

    if (existing) {
      const updated = await prisma.userdevice.update({
        where: { id: existing.id },
        data: {
          lastActiveAt: now,
          ...(ip ? { ip } : {}),
        },
      });
      return { success: true as const, deviceId: updated.id, lastSeenAt: now.toISOString() };
    }

    // Registrar nuevo dispositivo de confianza
    const created = await prisma.userdevice.create({
      data: {
        userId: user.id,
        deviceName,
        browser,
        os,
        ip,
        isTrusted: true,
        lastActiveAt: now,
      },
    });

    return { success: true as const, deviceId: created.id, lastSeenAt: now.toISOString() };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error registrando dispositivo") };
  }
}

/** Lista los dispositivos de confianza registrados por el usuario */
export async function listUserDevices(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const devices = await prisma.userdevice.findMany({
      where: { userId: user.id },
      orderBy: { lastActiveAt: "desc" },
      take: 20,
    });

    return {
      success: true as const,
      devices: devices.map((d) => ({
        id: d.id,
        deviceName: d.deviceName,
        browser: d.browser,
        os: d.os,
        ip: d.ip,
        isTrusted: d.isTrusted,
        lastActiveAt: d.lastActiveAt.toISOString(),
        createdAt: d.createdAt.toISOString(),
      })),
      lastSeenAt: user.lastSeenAt.toISOString(),
    };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error cargando dispositivos"), devices: [] };
  }
}

/** Revoca / elimina un dispositivo de confianza */
export async function revokeDevice(idToken: string, deviceId: string) {
  try {
    const user = await requireUser(idToken);
    await prisma.userdevice.deleteMany({
      where: {
        id: deviceId,
        userId: user.id,
      },
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "Error al revocar dispositivo") };
  }
}
