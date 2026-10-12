"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { Bell, MessageSquare, CheckCircle2, Wallet, XCircle, Scale, Gavel, X } from "lucide-react";
import { waitForUser } from "@/lib/client-auth";
import { useRealtime, type RealtimeUpdate } from "@/lib/use-realtime";
import {
  claimEvent, describeEvent, getNotifPrefs, playTone, showSystemNotification, tradeUrl,
  unlockAudioOnFirstGesture, type NotifContent,
} from "@/lib/notify";

type Toast = NotifContent & { id: string; url: string; kind: RealtimeUpdate["kind"] };

const ICONS: Record<RealtimeUpdate["kind"], React.ElementType> = {
  TRADE_CREATED: Bell,
  MESSAGE: MessageSquare,
  PAID: Wallet,
  RELEASED: CheckCircle2,
  CANCELLED: XCircle,
  DISPUTED: Scale,
  RESOLVED: Gavel,
  UPDATED: Bell,
};

const ACCENTS: Record<NotifContent["accent"], { ring: string; icon: string; bar: string }> = {
  emerald: { ring: "border-emerald-500/30", icon: "bg-emerald-500/15 text-emerald-500", bar: "bg-emerald-500" },
  sky: { ring: "border-sky-500/30", icon: "bg-sky-500/15 text-sky-500", bar: "bg-sky-500" },
  amber: { ring: "border-amber-500/40", icon: "bg-amber-400/20 text-amber-500", bar: "bg-amber-400" },
  rose: { ring: "border-rose-500/30", icon: "bg-rose-500/15 text-rose-500", bar: "bg-rose-500" },
  indigo: { ring: "border-indigo-500/30", icon: "bg-indigo-500/15 text-indigo-500", bar: "bg-indigo-500" },
  zinc: { ring: "border-zinc-500/30", icon: "bg-zinc-500/15 text-zinc-500", bar: "bg-zinc-400" },
};

const TOAST_MS = 7000;
const TITLE_BADGE = /^\(\d+\)\s/;

/**
 * Escucha el canal personal del usuario (SSE) y avisa con sonido, aviso en pantalla y
 * notificación del sistema cuando la pestaña está en segundo plano.
 */
export function TradeNotifier() {
  const router = useRouter();
  const pathname = usePathname();
  const [uid, setUid] = React.useState<string | null>(null);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const unread = React.useRef(0);
  const pathRef = React.useRef(pathname);

  React.useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  React.useEffect(() => {
    waitForUser().then((u) => setUid(u?.uid ?? null));
    return unlockAudioOnFirstGesture();
  }, []);

  // Contador de no leídos en el título de la pestaña: "(2) Roraima Exchange"
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        unread.current = 0;
        document.title = document.title.replace(TITLE_BADGE, "");
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const dismiss = React.useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const handle = React.useCallback(
    async (e: RealtimeUpdate) => {
      const content = describeEvent(e);
      if (!content) return;
      const key = `${e.kind}:${e.tradeId ?? ""}:${e.at}`;
      if (!(await claimEvent(key))) return; // otra pestaña ya avisó

      const prefs = getNotifPrefs();
      const url = tradeUrl(e.tradeId);
      const visible = document.visibilityState === "visible";
      const inThisRoom = !!e.tradeId && pathRef.current === url;

      if (prefs.sound) playTone(content.tone);

      // Si ya está mirando esa orden, la sala se actualiza sola: basta con el sonido
      if (visible && inThisRoom) return;

      if (visible) {
        const toast: Toast = { ...content, id: key, url, kind: e.kind };
        setToasts((t) => [toast, ...t.filter((x) => x.id !== key)].slice(0, 4));
        setTimeout(() => dismiss(key), TOAST_MS);
      } else {
        unread.current += 1;
        document.title = `(${unread.current}) ${document.title.replace(TITLE_BADGE, "")}`;
        if (prefs.desktop) {
          showSystemNotification(content, url, `${e.tradeId ?? "p2p"}:${e.kind}`, () => router.push(url));
        }
      }
    },
    [dismiss, router]
  );

  useRealtime({ enabled: !!uid }, handle);

  return (
    <div className="fixed top-20 md:top-6 right-4 md:right-6 z-[90] flex flex-col gap-3 w-[calc(100vw-2rem)] max-w-sm pointer-events-none" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind] ?? Bell;
          const a = ACCENTS[t.accent];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.95, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className={`pointer-events-auto relative overflow-hidden rounded-2xl border ${a.ring} bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl shadow-2xl shadow-black/10 dark:shadow-black/40`}
            >
              <button
                id={`notif-toast-${t.kind.toLowerCase()}`}
                onClick={() => {
                  dismiss(t.id);
                  router.push(t.url);
                }}
                className="w-full text-left flex items-start gap-3 p-4 pr-10 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
              >
                <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${a.icon}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-sm text-zinc-900 dark:text-zinc-50">{t.title}</span>
                  <span className="block text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">{t.body}</span>
                  <span className="block text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-1.5">Ver orden →</span>
                </span>
              </button>
              <button
                aria-label="Cerrar aviso"
                onClick={() => dismiss(t.id)}
                className="absolute top-3 right-3 p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <motion.span
                className={`absolute bottom-0 left-0 h-0.5 ${a.bar}`}
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: TOAST_MS / 1000, ease: "linear" }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
