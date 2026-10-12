"use server";

import prisma from "@/lib/prisma";
import { requireStaff, requireUser, toClientError } from "@/lib/server-auth";
import { ensureSystemUser, SYSTEM_USER_ID, TradeRuleError } from "@/lib/ledger";

/**
 * Centro de soporte REAL: tickets persistidos en BD.
 *  - El usuario escribe → se crea (o reutiliza) su ticket abierto.
 *  - RoraimaBot responde una sola vez con un triage automático (guardado con isBot).
 *  - El staff (ADMIN/SUPPORT) atiende desde /support-panel.
 * Estados: OPEN (espera al staff) | ANSWERED (espera al usuario) | CLOSED.
 */

const MAX_LEN = 2000;
const MAX_MSGS_PER_HOUR = 30;

type Topic = "FRAUD" | "DEPOSIT" | "KYC" | "MERCHANT" | "GENERAL";

const TOPIC_SUBJECT: Record<Topic, string> = {
  FRAUD: "Reporte de estafa / disputa",
  DEPOSIT: "Problema con depósito o retiro",
  KYC: "Verificación de identidad",
  MERCHANT: "Solicitud de comerciante verificado",
  GENERAL: "Consulta general",
};

const BOT_REPLY: Record<Topic, string> = {
  FRAUD:
    "Entiendo la gravedad de la situación. Tu ticket fue marcado con prioridad ALTA para el equipo de Prevención de Fraude. Si se trata de una orden P2P, abre también una apelación desde la sala de la orden: así los fondos quedan congelados en custodia hasta que un mediador resuelva. Adjunta el número de orden y los comprobantes.",
  DEPOSIT:
    "Para depósitos: verifica que enviaste USDT por la red TRC20 al monto EXACTO indicado (incluidos los decimales) antes de que venza la solicitud. Para retiros: los procesa un operador y se verifican en la blockchain. Indícanos el TXID o el ID de la solicitud y un agente lo revisará.",
  KYC:
    "Los rechazos de KYC suelen deberse a fotos borrosas, con reflejos o recortadas. Un agente revisará tu caso manualmente; mientras tanto puedes volver a enviar tus documentos desde Perfil → Verificar.",
  MERCHANT:
    "¡Gracias por tu interés en ser comerciante verificado! Requisitos: KYC aprobado, al menos 20 órdenes completadas en 30 días y tasa de finalización ≥ 90%. Cuéntanos tu volumen mensual estimado y métodos de pago; un agente evaluará tu solicitud.",
  GENERAL:
    "He registrado tu mensaje. Un agente de soporte humano revisará tu caso y te responderá por este mismo medio. Puedes cerrar esta página: tu conversación queda guardada.",
};

function detectTopic(text: string, hint?: string): Topic {
  if (hint && hint in TOPIC_SUBJECT) return hint as Topic;
  const t = text.toLowerCase();
  if (/(estafa|fraude|robo|disputa|apelaci|no libera|reportar)/.test(t)) return "FRAUD";
  if (/(dep[oó]sito|retiro|txid|trc20|recarga)/.test(t)) return "DEPOSIT";
  if (/(kyc|verificaci|c[eé]dula|documento|selfie)/.test(t)) return "KYC";
  if (/(comerciante|merchant)/.test(t)) return "MERCHANT";
  return "GENERAL";
}

function serializeMessages(msgs: { id: string; senderId: string; content: string; isBot: boolean; createdAt: Date; user: { role: string; name: string | null } }[], viewerId: string) {
  return msgs.map((m) => ({
    id: m.id,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    from: m.isBot ? ("bot" as const) : m.senderId === viewerId ? ("me" as const) : m.user.role === "ADMIN" || m.user.role === "SUPPORT" ? ("agent" as const) : ("user" as const),
    senderName: m.isBot ? "RoraimaBot" : m.user.name ?? "Usuario",
  }));
}

const msgInclude = { user: { select: { role: true, name: true } } } as const;

// ============================================================================
//  USUARIO
// ============================================================================

export async function getMySupportThread(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const ticket = await prisma.supportticket.findFirst({
      where: { userId: user.id, status: { not: "CLOSED" } },
      orderBy: { createdAt: "desc" },
      include: { supportmessage: { orderBy: { createdAt: "asc" }, include: msgInclude } },
    });
    if (!ticket) return { success: true as const, ticket: null };
    return {
      success: true as const,
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        type: ticket.type,
        createdAt: ticket.createdAt.toISOString(),
        messages: serializeMessages(ticket.supportmessage, user.id),
      },
    };
  } catch (e) {
    return { success: false as const, error: toClientError(e, "No se pudo cargar tu conversación") };
  }
}

export async function sendSupportMessage(idToken: string, data: { content: string; topic?: string }) {
  try {
    const user = await requireUser(idToken);
    const content = String(data.content ?? "").trim().slice(0, MAX_LEN);
    if (!content) throw new TradeRuleError("Escribe un mensaje");

    const recent = await prisma.supportmessage.count({
      where: { senderId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent >= MAX_MSGS_PER_HOUR) throw new TradeRuleError("Enviaste demasiados mensajes. Espera unos minutos.");

    await prisma.$transaction(async (tx) => {
      let ticket = await tx.supportticket.findFirst({
        where: { userId: user.id, status: { not: "CLOSED" } },
        orderBy: { createdAt: "desc" },
      });
      const isNew = !ticket;
      const topic = detectTopic(content, data.topic);
      if (!ticket) {
        ticket = await tx.supportticket.create({
          data: { userId: user.id, subject: content.length > 80 ? TOPIC_SUBJECT[topic] : content, type: topic, status: "OPEN" },
        });
      } else {
        await tx.supportticket.update({ where: { id: ticket.id }, data: { status: "OPEN" } });
      }
      await tx.supportmessage.create({ data: { ticketId: ticket.id, senderId: user.id, content } });
      if (isNew) {
        await ensureSystemUser(tx);
        await tx.supportmessage.create({ data: { ticketId: ticket.id, senderId: SYSTEM_USER_ID, content: BOT_REPLY[topic], isBot: true } });
      }
    });
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: toClientError(e, "No se pudo enviar tu mensaje") };
  }
}

export async function closeMySupportTicket(idToken: string, ticketId: string) {
  try {
    const user = await requireUser(idToken);
    const res = await prisma.supportticket.updateMany({ where: { id: ticketId, userId: user.id }, data: { status: "CLOSED" } });
    if (res.count !== 1) throw new TradeRuleError("Ticket no encontrado");
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: toClientError(e, "No se pudo cerrar el ticket") };
  }
}

// ============================================================================
//  STAFF (ADMIN / SUPPORT)
// ============================================================================

export async function getSupportPanelData(idToken: string, status: "ACTIVE" | "CLOSED" = "ACTIVE") {
  try {
    await requireStaff(idToken);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [tickets, open, disputes, pendingKyc, resolvedToday] = await Promise.all([
      prisma.supportticket.findMany({
        where: status === "ACTIVE" ? { status: { not: "CLOSED" } } : { status: "CLOSED" },
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: {
          user: { select: { email: true, name: true, kycStatus: true } },
          supportmessage: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, createdAt: true } },
        },
      }),
      prisma.supportticket.count({ where: { status: { not: "CLOSED" } } }),
      prisma.p2ptrade.count({ where: { status: "DISPUTED" } }),
      prisma.user.count({ where: { kycStatus: "PENDING" } }),
      prisma.supportticket.count({ where: { status: "CLOSED", updatedAt: { gte: today } } }),
    ]);
    return {
      success: true as const,
      stats: { open, disputes, pendingKyc, resolvedToday },
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        type: t.type,
        status: t.status,
        userEmail: t.user.email,
        userName: t.user.name,
        userKyc: t.user.kycStatus,
        lastMessage: t.supportmessage[0]?.content.slice(0, 120) ?? "",
        updatedAt: t.updatedAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
      })),
    };
  } catch (e) {
    return { success: false as const, error: toClientError(e, "No se pudo cargar el panel") };
  }
}

export async function getTicketThread(idToken: string, ticketId: string) {
  try {
    const staff = await requireStaff(idToken);
    const ticket = await prisma.supportticket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, email: true, name: true, kycStatus: true, createdAt: true } },
        supportmessage: { orderBy: { createdAt: "asc" }, include: msgInclude },
      },
    });
    if (!ticket) throw new TradeRuleError("Ticket no encontrado");
    // Contexto útil para el agente: órdenes activas/disputadas del usuario
    const trades = await prisma.p2ptrade.findMany({
      where: { OR: [{ buyerId: ticket.userId }, { sellerId: ticket.userId }], status: { in: ["PENDING_PAYMENT", "PAID", "DISPUTED"] } },
      select: { id: true, status: true, cryptoAmount: true },
      take: 10,
    });
    return {
      success: true as const,
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        type: ticket.type,
        createdAt: ticket.createdAt.toISOString(),
        user: { ...ticket.user, createdAt: ticket.user.createdAt.toISOString() },
        trades,
        messages: serializeMessages(ticket.supportmessage, staff.id),
      },
    };
  } catch (e) {
    return { success: false as const, error: toClientError(e, "No se pudo cargar el ticket") };
  }
}

export async function replyTicket(idToken: string, ticketId: string, content: string) {
  try {
    const staff = await requireStaff(idToken);
    const text = String(content ?? "").trim().slice(0, MAX_LEN);
    if (!text) throw new TradeRuleError("Escribe una respuesta");
    await prisma.$transaction(async (tx) => {
      const t = await tx.supportticket.findUnique({ where: { id: ticketId } });
      if (!t) throw new TradeRuleError("Ticket no encontrado");
      await tx.supportmessage.create({ data: { ticketId, senderId: staff.id, content: text } });
      await tx.supportticket.update({ where: { id: ticketId }, data: { status: "ANSWERED" } });
    });
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: toClientError(e, "No se pudo enviar la respuesta") };
  }
}

export async function setTicketStatus(idToken: string, ticketId: string, status: "OPEN" | "CLOSED") {
  try {
    await requireStaff(idToken);
    if (status !== "OPEN" && status !== "CLOSED") throw new TradeRuleError("Estado no válido");
    await prisma.supportticket.update({ where: { id: ticketId }, data: { status } });
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: toClientError(e, "No se pudo actualizar el ticket") };
  }
}
