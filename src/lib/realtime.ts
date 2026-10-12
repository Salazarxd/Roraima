import "server-only";
import { EventEmitter } from "events";
import prisma from "@/lib/prisma";

/**
 * Bus de eventos en tiempo real (Server-Sent Events).
 *
 * Canales:
 *  - `trade:<tradeId>` → sala de la orden (chat + cambios de estado)
 *  - `user:<userId>`   → avisos personales (nueva orden contigo, mensaje, pago, liberación…)
 *
 * Los eventos NO llevan datos sensibles: solo avisan "algo cambió" y el cliente vuelve a pedir
 * los datos por la vía autenticada de siempre (server actions).
 *
 * Nota: el bus vive en memoria del proceso. Con un solo servidor Node (como ahora) es suficiente;
 * si en el futuro se escala a varias instancias, reemplazar por Redis Pub/Sub manteniendo esta API.
 */

export type RealtimeKind =
  | "TRADE_CREATED"
  | "MESSAGE"
  | "PAID"
  | "RELEASED"
  | "CANCELLED"
  | "DISPUTED"
  | "RESOLVED"
  | "UPDATED";

export type RealtimeEvent = { kind: RealtimeKind; tradeId?: string; actorId?: string; at: number };

const g = globalThis as unknown as { __roraimaRealtimeBus?: EventEmitter };
const bus =
  g.__roraimaRealtimeBus ??
  (g.__roraimaRealtimeBus = (() => {
    const e = new EventEmitter();
    e.setMaxListeners(0); // una conexión SSE = un listener
    return e;
  })());

export function publish(channel: string, event: Omit<RealtimeEvent, "at">) {
  bus.emit(channel, { ...event, at: Date.now() } satisfies RealtimeEvent);
}

export function subscribe(channel: string, listener: (e: RealtimeEvent) => void) {
  bus.on(channel, listener);
  return () => {
    bus.off(channel, listener);
  };
}

/**
 * Avisa a la sala de la orden y a ambas partes. Llamar SIEMPRE después de que la transacción
 * haya hecho commit (si no, el cliente podría recargar antes de ver el cambio).
 * Nunca lanza: un fallo de notificación no debe romper la operación principal.
 */
export async function publishTrade(tradeId: string, kind: RealtimeKind, actorId?: string) {
  try {
    publish(`trade:${tradeId}`, { kind, tradeId, actorId });
    const t = await prisma.p2ptrade.findUnique({ where: { id: tradeId }, select: { buyerId: true, sellerId: true } });
    if (!t) return;
    for (const uid of new Set([t.buyerId, t.sellerId])) {
      if (uid !== actorId) publish(`user:${uid}`, { kind, tradeId, actorId });
    }
  } catch (e) {
    console.error("[realtime] publishTrade failed:", e);
  }
}
