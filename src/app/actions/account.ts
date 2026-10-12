"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";
import { SYSTEM_USER_ID, TradeRuleError } from "@/lib/ledger";
import { missingProfileFields, normalizeDocument } from "@/lib/profile";

/**
 * Cuenta del usuario: perfil, nivel de seguridad y notificaciones.
 * Todos los datos salen de la base de datos (nada simulado).
 */

const LEDGER_TITLES: Record<string, string> = {
  DEPOSIT: "Depósito acreditado",
  WITHDRAWAL: "Retiro solicitado",
  WITHDRAWAL_REFUND: "Retiro reembolsado",
  TRANSFER_IN: "Transferencia recibida",
  TRANSFER_OUT: "Transferencia enviada",
  P2P_ESCROW: "Fondos en custodia P2P",
  P2P_REFUND: "Custodia P2P devuelta",
  P2P_RECEIVE: "USDT recibidos (P2P)",
  AD_FREEZE: "Fondos congelados en anuncio",
  AD_UNFREEZE: "Fondos liberados de anuncio",
  FEE: "Comisión de anunciante",
  ADJUSTMENT: "Ajuste de saldo",
};

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
function hasValue(v: string | null | undefined): boolean { return Boolean(v && v.trim()); }
const NAME_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{2,60}$/;

export async function getMyProfile(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const [paymentMethods, wallet, kycDocs] = await Promise.all([
      prisma.userpaymentmethod.count({ where: { userId: user.id } }),
      prisma.wallet.findFirst({ where: { userId: user.id, currency: "USDT" } }),
      prisma.kycdocument.count({ where: { userId: user.id } }),
    ]);
    const identityLocked = user.kycStatus === "VERIFIED" || user.kycStatus === "PENDING";
    return {
      success: true as const,
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        document: user.document,
        phone: user.phone,
        address: user.address,
        role: user.role,
        kycStatus: user.kycStatus,
        kycDocuments: kycDocs,
        paymentMethods,
        balance: wallet?.balance ?? 0,
        createdAt: user.createdAt.toISOString(),
        // Identidad bloqueada una vez verificada (igual que Binance)
        identityLocked,
        locks: {
          firstName: identityLocked && hasValue(user.firstName),
          lastName: identityLocked && hasValue(user.lastName),
          document: identityLocked && hasValue(user.document),
        },
        missing: missingProfileFields(user),
        twoFactorEnabled: user.twoFactorEnabled,
        whitelistEnabled: user.whitelistEnabled,
      },
    };
  } catch (e) {
    return { success: false as const, error: toClientError(e, "No se pudo cargar tu perfil") };
  }
}


export async function updateProfile(
  idToken: string,
  data: { firstName?: string; lastName?: string; document?: string; phone?: string; address?: string }
) {
  try {
    const user = await requireUser(idToken);
    const locked = user.kycStatus === "VERIFIED" || user.kycStatus === "PENDING";

    const phone = clean(data.phone, 30);
    const address = clean(data.address, 300);
    if (!phone) throw new TradeRuleError("El teléfono es obligatorio");
    if (!/^\+?[0-9\s-]{7,20}$/.test(phone)) throw new TradeRuleError("Número de teléfono no válido (ej. +58 414-0000000)");
    if (address.length < 5) throw new TradeRuleError("La dirección es obligatoria (ciudad y estado como mínimo)");

    const next = {
      firstName: user.firstName,
      lastName: user.lastName,
      document: user.document,
      phone,
      address,
    };
    let documentNumber: string | undefined;

    // Campos de identidad: editables si la cuenta no está en revisión/verificada,
    // o si aún están vacíos (completar una sola vez). Nunca se sobreescriben una vez bloqueados.
    if (!locked || !hasValue(user.firstName)) {
      const v = clean(data.firstName, 60);
      if (!NAME_RE.test(v)) throw new TradeRuleError("Nombres obligatorios (solo letras)");
      next.firstName = v;
    }
    if (!locked || !hasValue(user.lastName)) {
      const v = clean(data.lastName, 60);
      if (!NAME_RE.test(v)) throw new TradeRuleError("Apellidos obligatorios (solo letras)");
      next.lastName = v;
    }
    if (!locked || !hasValue(user.document)) {
      const norm = normalizeDocument(clean(data.document, 20));
      if (!norm) throw new TradeRuleError("Documento de identidad obligatorio (ej. V-12345678)");
      // Anti multi-cuenta: una cédula (por sus dígitos) solo puede pertenecer a una cuenta
      const dup = await prisma.user.count({ where: { id: { not: user.id }, documentNumber: norm.digits } });
      if (dup) throw new TradeRuleError("Esa cédula ya está registrada en otra cuenta. Si es tuya, contacta a soporte.");
      next.document = norm.doc;
      documentNumber = norm.digits;
    }

    const missing = missingProfileFields(next);
    if (missing.length) throw new TradeRuleError(`Faltan datos obligatorios: ${missing.join(", ")}`);

    await prisma.user.update({
      where: { id: user.id },
      data: { ...next, ...(documentNumber ? { documentNumber } : {}), name: `${next.firstName} ${next.lastName}`.trim() },
    });
    return { success: true as const, identityLocked: locked };
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return { success: false as const, error: "Esa cédula ya está registrada en otra cuenta. Si es tuya, contacta a soporte." };
    }
    return { success: false as const, error: toClientError(e, "No se pudo actualizar tu perfil") };
  }
}

export type NotificationItem = {
  id: string;
  kind: "TRADE" | "WALLET" | "WITHDRAWAL" | "DEPOSIT" | "P2P_AD" | "SYSTEM";
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  amount?: number;
};

export async function getNotifications(idToken: string) {
  try {
    const user = await requireUser(idToken);

    const [messages, ledger, withdrawals, deposits, userNotifs] = await Promise.all([
      prisma.p2pchatmessage.findMany({
        where: {
          senderId: { in: [SYSTEM_USER_ID] },
          p2ptrade: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, tradeId: true, content: true, createdAt: true },
      }),
      prisma.wallettx.findMany({
        where: { userId: user.id, NOT: { amount: 0 } },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.withdrawal.findMany({
        where: { userId: user.id, status: { in: ["COMPLETED", "REJECTED"] } },
        orderBy: { processedAt: "desc" },
        take: 15,
      }),
      prisma.deposit.findMany({
        where: { userId: user.id, status: "EXPIRED" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.usernotification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
    ]);

    // Mensajes de chat de la contraparte (sin leer = últimas 24h)
    const recentChats = await prisma.p2pchatmessage.findMany({
      where: {
        senderId: { notIn: [user.id, SYSTEM_USER_ID] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        p2ptrade: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, tradeId: true, content: true, createdAt: true },
    });

    const items: NotificationItem[] = [
      ...userNotifs.map((n) => ({
        id: `un-${n.id}`,
        kind: (n.kind as "P2P_AD" | "SYSTEM") || "P2P_AD",
        title: n.title,
        body: n.body,
        href: n.href,
        createdAt: n.createdAt.toISOString(),
      })),
      ...messages.map((m) => ({
        id: `m-${m.id}`,
        kind: "TRADE" as const,
        title: `Orden P2P #${m.tradeId.slice(0, 8).toUpperCase()}`,
        body: m.content.replace(/^\[SISTEMA\]\s*/, ""),
        href: `/dashboard/p2p/trade/${m.tradeId}`,
        createdAt: m.createdAt.toISOString(),
      })),
      ...recentChats.map((m) => ({
        id: `c-${m.id}`,
        kind: "TRADE" as const,
        title: `Nuevo mensaje · Orden #${m.tradeId.slice(0, 8).toUpperCase()}`,
        body: m.content.startsWith("[ATTACHMENT]") ? "Te enviaron un archivo adjunto" : m.content.slice(0, 160),
        href: `/dashboard/p2p/trade/${m.tradeId}`,
        createdAt: m.createdAt.toISOString(),
      })),
      ...ledger.map((t) => ({
        id: `l-${t.id}`,
        kind: "WALLET" as const,
        title: LEDGER_TITLES[t.type] ?? t.type,
        body: t.note ?? "",
        href: "/dashboard/wallets",
        createdAt: t.createdAt.toISOString(),
        amount: t.amount,
      })),
      ...withdrawals.map((w) => ({
        id: `w-${w.id}`,
        kind: "WITHDRAWAL" as const,
        title: w.status === "COMPLETED" ? "Retiro enviado" : "Retiro rechazado",
        body:
          w.status === "COMPLETED"
            ? `${w.netAmount} USDT enviados a ${w.address.slice(0, 6)}…${w.address.slice(-4)}`
            : `Motivo: ${w.note ?? "sin especificar"}. Los fondos se devolvieron a tu billetera.`,
        href: "/dashboard/wallets",
        createdAt: (w.processedAt ?? w.createdAt).toISOString(),
      })),
      ...deposits.map((d) => ({
        id: `d-${d.id}`,
        kind: "DEPOSIT" as const,
        title: "Solicitud de depósito vencida",
        body: `No se detectó la transferencia de ${d.expectedAmount} USDT a tiempo.`,
        href: "/dashboard/wallets",
        createdAt: d.expiresAt.toISOString(),
      })),
    ];

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { success: true as const, items: items.slice(0, 60) };
  } catch (e) {
    return { success: false as const, error: toClientError(e, "No se pudieron cargar las notificaciones"), items: [] as NotificationItem[] };
  }
}
