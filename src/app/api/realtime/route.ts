import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser, STAFF_ROLES } from "@/lib/server-auth";
import { subscribe, type RealtimeEvent } from "@/lib/realtime";

/**
 * GET /api/realtime?token=<idToken>[&trade=<tradeId>]
 *
 * Server-Sent Events. Sin `trade` → canal personal del usuario. Con `trade` → sala de la orden
 * (solo comprador, vendedor o staff). EventSource no permite cabeceras, por eso el token va en la URL;
 * los eventos solo avisan "algo cambió" (sin datos), el cliente recarga por la vía autenticada.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let channel: string;
  try {
    const user = await requireUser(params.get("token"));
    const tradeId = params.get("trade");
    if (tradeId) {
      const t = await prisma.p2ptrade.findUnique({ where: { id: tradeId }, select: { buyerId: true, sellerId: true } });
      const isStaff = (STAFF_ROLES as readonly string[]).includes(user.role);
      if (!t || (t.buyerId !== user.id && t.sellerId !== user.id && !isStaff)) {
        return new Response("Forbidden", { status: 403 });
      }
      channel = `trade:${tradeId}`;
    } else {
      channel = `user:${user.id}`;
    }
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      // retry: el navegador reintenta a los 3 s si se corta
      send(`retry: 3000\nevent: ready\ndata: {"channel":"${channel.split(":")[0]}"}\n\n`);

      const unsubscribe = subscribe(channel, (e: RealtimeEvent) => send(`event: update\ndata: ${JSON.stringify(e)}\n\n`));
      // Latido para que proxies/navegador no cierren la conexión inactiva
      const heartbeat = setInterval(() => send(`: ping\n\n`), 25_000);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
