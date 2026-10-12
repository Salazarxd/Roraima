"use client";

import * as React from "react";

export type RealtimeUpdate = {
  kind: "TRADE_CREATED" | "MESSAGE" | "PAID" | "RELEASED" | "CANCELLED" | "DISPUTED" | "RESOLVED" | "UPDATED";
  tradeId?: string;
  actorId?: string;
  at: number;
};

/**
 * Suscripción SSE a /api/realtime. Si la conexión se cae (red, token vencido, reinicio del
 * servidor) se reconecta con un token NUEVO con espera progresiva. Devuelve `true` mientras
 * hay conexión en vivo, para mostrar el indicador y relajar el sondeo de respaldo.
 */
export function useRealtime(opts: { tradeId?: string; enabled?: boolean }, onUpdate: (e: RealtimeUpdate) => void) {
  const { tradeId, enabled = true } = opts;
  const [live, setLive] = React.useState(false);
  const handler = React.useRef(onUpdate);
  React.useEffect(() => {
    handler.current = onUpdate;
  }, [onUpdate]);

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("EventSource" in window)) return;
    let es: EventSource | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = async () => {
      if (stopped) return;
      try {
        const { getIdToken } = await import("@/lib/client-auth");
        const token = await getIdToken();
        if (stopped) return;
        const qs = new URLSearchParams({ token });
        if (tradeId) qs.set("trade", tradeId);
        es = new EventSource(`/api/realtime?${qs.toString()}`);
        es.addEventListener("ready", () => {
          attempt = 0;
          setLive(true);
        });
        es.addEventListener("update", (ev) => {
          try {
            handler.current(JSON.parse((ev as MessageEvent).data) as RealtimeUpdate);
          } catch {
            /* evento malformado: se ignora */
          }
        });
        es.onerror = () => {
          // Cerramos nosotros y reconectamos con token fresco (EventSource reusaría el vencido)
          setLive(false);
          es?.close();
          es = null;
          scheduleReconnect();
        };
      } catch {
        setLive(false);
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (stopped || retry) return;
      const delay = Math.min(30_000, 2_000 * 2 ** attempt++);
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, delay);
    };

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      es?.close();
      setLive(false);
    };
  }, [tradeId, enabled]);

  return live;
}
