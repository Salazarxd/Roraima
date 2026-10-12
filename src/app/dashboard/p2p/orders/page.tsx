"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, CheckCircle2, XCircle, Scale, Hourglass, ChevronRight, Loader2, Inbox } from "lucide-react";
import { getIdToken } from "@/lib/client-auth";
import { fetchMyTrades } from "@/app/actions/p2p";

type TradeRow = Awaited<ReturnType<typeof fetchMyTrades>>[number];

const META: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  PENDING_PAYMENT: { label: "Esperando pago", cls: "text-amber-600 bg-amber-500/10", icon: Clock },
  PAID: { label: "Pagada", cls: "text-sky-600 bg-sky-500/10", icon: Hourglass },
  DISPUTED: { label: "En mediación", cls: "text-rose-600 bg-rose-500/10", icon: Scale },
  CANCELLED: { label: "Cancelada", cls: "text-zinc-500 bg-zinc-500/10", icon: XCircle },
  COMPLETED: { label: "Completada", cls: "text-emerald-600 bg-emerald-500/10", icon: CheckCircle2 },
};

export default function MyOrdersPage() {
  const router = useRouter();
  const [trades, setTrades] = React.useState<TradeRow[] | null>(null);
  const [filter, setFilter] = React.useState<"active" | "all">("active");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMyTrades(await getIdToken());
        if (!cancelled) setTrades(data);
      } catch {
        router.push("/auth");
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const list = (trades ?? []).filter((t) => filter === "all" || ["PENDING_PAYMENT", "PAID", "DISPUTED"].includes(t.status));

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.push("/dashboard/p2p")} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
          <ArrowLeft className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Mis Órdenes P2P</h1>
          <p className="text-sm text-zinc-500">Accede a tus salas de orden activas e historial.</p>
        </div>
      </div>

      <div className="inline-flex bg-zinc-100 dark:bg-zinc-900 rounded-full p-1 mb-6">
        {(["active", "all"] as const).map((f) => (
          <button key={f} id={`orders-filter-${f}`} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${filter === f ? "bg-white dark:bg-zinc-800 text-emerald-600 shadow-sm" : "text-zinc-500"}`}>
            {f === "active" ? "En curso" : "Todas"}
          </button>
        ))}
      </div>

      {trades === null ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <Inbox className="w-10 h-10 mx-auto mb-3 text-zinc-300" />
          {filter === "active" ? "No tienes órdenes en curso." : "Aún no has realizado operaciones."}
        </div>
      ) : (
        <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }} className="space-y-3">
          {list.map((t) => {
            const m = META[t.status] ?? META.PENDING_PAYMENT;
            const Icon = m.icon;
            return (
              <motion.button
                key={t.id}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                onClick={() => router.push(`/dashboard/p2p/trade/${t.id}`)}
                className="w-full text-left bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800/60 hover:border-emerald-500/40 hover:shadow-lg transition-all flex items-center gap-4 group"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${m.cls}`}><Icon className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-black ${t.side === "BUY" ? "text-emerald-600" : "text-rose-500"}`}>{t.side === "BUY" ? "COMPRA" : "VENTA"}</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-50 truncate">{t.cryptoAmount.toFixed(2)} USDT</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5 truncate">
                    {t.fiatAmount.toLocaleString("es-VE", { maximumFractionDigits: 2 })} VES · #{t.id.slice(-8).toUpperCase()} · {new Date(t.createdAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
                <span className={`hidden sm:inline px-2.5 py-1 rounded-lg text-xs font-bold ${m.cls}`}>{m.label}</span>
                <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-emerald-500 transition-colors" />
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
