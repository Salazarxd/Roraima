"use client";

import * as React from "react";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { Bell, ArrowLeftRight, Wallet, ArrowUpRight, ArrowDownLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { NotificationItem } from "@/app/actions/account";

const containerVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const itemVariants: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } };

const SEEN_KEY = "roraima:notifications:lastSeen";
const FILTERS = [
  { id: "ALL", label: "Todas" },
  { id: "TRADE", label: "P2P" },
  { id: "WALLET", label: "Billetera" },
] as const;

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Ahora";
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-VE");
}

function iconFor(n: NotificationItem) {
  if (n.kind === "TRADE") return { Icon: ArrowLeftRight, cls: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" };
  if (n.kind === "P2P_AD") return { Icon: Bell, cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" };
  if (n.kind === "SYSTEM") return { Icon: Bell, cls: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" };
  if (n.kind === "WITHDRAWAL") return { Icon: ArrowUpRight, cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" };
  if (n.kind === "DEPOSIT") return { Icon: ArrowDownLeft, cls: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500" };
  return n.amount != null && n.amount < 0
    ? { Icon: ArrowUpRight, cls: "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" }
    : { Icon: Wallet, cls: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" };
}

export default function NotificationsPage() {
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["id"]>("ALL");
  const [lastSeen, setLastSeen] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { getNotifications } = await import("@/app/actions/account");
      const res = await getNotifications(await getIdToken());
      if (res.success) { setItems(res.items); setError(null); }
      else setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las notificaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setLastSeen(localStorage.getItem(SEEN_KEY) ?? "");
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // Al abrir la página se marcan como leídas (el resaltado se mantiene hasta la próxima visita)
  React.useEffect(() => {
    if (items && items.length > 0) localStorage.setItem(SEEN_KEY, items[0].createdAt);
  }, [items]);

  const visible = (items ?? []).filter((n) =>
    filter === "ALL" ? true : filter === "TRADE" ? n.kind === "TRADE" : n.kind !== "TRADE"
  );
  const unread = (items ?? []).filter((n) => !lastSeen || n.createdAt > lastSeen).length;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Notificaciones</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Historial de alertas y mensajes del sistema{unread > 0 && items ? ` · ${unread} nuevas` : ""}
          </p>
        </div>
        <button
          id="notifications-refresh"
          onClick={load}
          className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/60 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          aria-label="Actualizar"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            id={`notifications-filter-${f.id.toLowerCase()}`}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              filter === f.id
                ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900"
                : "bg-white dark:bg-zinc-900 text-zinc-500 border border-zinc-100 dark:border-zinc-800/60"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-2xl p-4 text-sm">{error}</div>}

      {!items && !error ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-[1.5rem] bg-zinc-100 dark:bg-zinc-900 animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-12 text-center border border-zinc-100 dark:border-zinc-800/60 shadow-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 mb-4">
            <Bell className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">No hay notificaciones</h3>
          <p className="text-zinc-500 mt-2">Te avisaremos cuando ocurra algo importante.</p>
        </div>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="bg-white dark:bg-zinc-900 rounded-[2rem] p-2 sm:p-3 border border-zinc-100 dark:border-zinc-800/60 shadow-sm">
          {visible.map((n) => {
            const { Icon, cls } = iconFor(n);
            const isNew = !lastSeen || n.createdAt > lastSeen;
            const content = (
              <div className="flex items-start gap-4 p-4 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-950/50 transition-colors group">
                <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${cls}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50 truncate flex items-center gap-2">
                      {isNew && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                      {n.title}
                    </span>
                    <span className="text-[11px] text-zinc-400 shrink-0">{timeAgo(n.createdAt)}</span>
                  </div>
                  {n.body && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{n.body}</p>}
                  {n.amount != null && (
                    <span className={`text-xs font-bold mt-1 inline-block ${n.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {n.amount >= 0 ? "+" : ""}{n.amount.toFixed(2)} USDT
                    </span>
                  )}
                </div>
                {n.href && <ChevronRight className="w-4 h-4 mt-3 text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-colors" />}
              </div>
            );
            return (
              <motion.div key={n.id} variants={itemVariants}>
                {n.href ? <Link href={n.href}>{content}</Link> : content}
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
