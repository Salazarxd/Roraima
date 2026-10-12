"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

type Ad = {
  id: string;
  type: string;
  amount: number;
  price: number;
  minAmount: number;
  maxAmount: number;
  methods: string;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  completedQty: number;
  completedCount: number;
  activeTrades: number;
};

const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  OPEN: { t: "Online", c: "text-emerald-500" },
  PAUSED: { t: "Pausado", c: "text-amber-500" },
  CLOSED: { t: "Cerrado", c: "text-zinc-400" },
};

export default function MyAdsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<"REGULAR" | "PREMIUM">("REGULAR");
  const [ads, setAds] = React.useState<Ad[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeCount, setActiveCount] = React.useState(0);
  const [refPrice, setRefPrice] = React.useState<number | null>(null);

  // Filtros (borrador + aplicados, como en Binance: se aplican con "Filtrar")
  const [draft, setDraft] = React.useState({ side: "ALL", status: "ALL", from: "", to: "" });
  const [filters, setFilters] = React.useState(draft);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [closing, setClosing] = React.useState<Ad | null>(null);
  const [editing, setEditing] = React.useState<Ad | null>(null);
  const [editForm, setEditForm] = React.useState({ price: "", minAmount: "", maxAmount: "", methods: "" });

  const filteredAds = React.useMemo(() => {
    return ads.filter(ad => {
      if (activeTab === "PREMIUM" ? !ad.type.includes("PREMIUM") : ad.type.includes("PREMIUM")) return false;
      if (filters.side !== "ALL" && !ad.type.startsWith(filters.side)) return false;
      if (filters.status !== "ALL" && ad.status !== filters.status) return false;
      const created = new Date(ad.createdAt).getTime();
      if (filters.from && created < new Date(filters.from + "T00:00:00").getTime()) return false;
      if (filters.to && created > new Date(filters.to + "T23:59:59").getTime()) return false;
      return true;
    });
  }, [ads, activeTab, filters]);

  const loadMyAds = React.useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const token = await currentUser.getIdToken();
    const { fetchMyP2POrders, fetchMyTrades } = await import("@/app/actions/p2p");
    const [data, trades] = await Promise.all([fetchMyP2POrders(token), fetchMyTrades(token)]);
    setAds(data as Ad[]);
    setActiveCount(trades.filter((t) => ["PENDING_PAYMENT", "PAID", "DISPUTED"].includes(t.status)).length);
  }, []);

  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) await loadMyAds();
      setLoading(false);
    });
    import("@/app/actions/exchange-rate").then(({ getReferenceRates }) => getReferenceRates().then((r) => setRefPrice(r.binance ?? r.parallel)));
    return () => unsubscribe();
  }, [loadMyAds]);

  const showToast = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3500);
  };

  const runStatus = async (ids: string[], action: "PAUSE" | "RESUME" | "CLOSE") => {
    if (ids.length === 0) return;
    setBusyId(ids.length === 1 ? ids[0] : "bulk");
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const token = await getIdToken();
      const { updateAdStatus } = await import("@/app/actions/p2p");
      const results = await Promise.all(ids.map((id) => updateAdStatus(token, id, action)));
      const failed = results.find((r) => !r.success);
      if (failed && !failed.success) showToast(false, failed.error);
      else showToast(true, action === "PAUSE" ? "Anuncio pausado" : action === "RESUME" ? "Anuncio publicado" : "Anuncio cerrado. Los USDT restantes volvieron a tu billetera.");
      setSelected(new Set());
      await loadMyAds();
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (ad: Ad) => {
    setEditing(ad);
    setEditForm({ price: String(ad.price), minAmount: String(ad.minAmount), maxAmount: String(ad.maxAmount), methods: ad.methods });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusyId(editing.id);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { updateAd } = await import("@/app/actions/p2p");
      const res = await updateAd(await getIdToken(), editing.id, {
        price: parseFloat(editForm.price),
        minAmount: parseFloat(editForm.minAmount),
        maxAmount: parseFloat(editForm.maxAmount),
        methods: editForm.methods,
      });
      if (!res.success) showToast(false, res.error);
      else {
        showToast(true, "Anuncio actualizado");
        setEditing(null);
        await loadMyAds();
      }
    } finally {
      setBusyId(null);
    }
  };

  const selectable = filteredAds.filter((a) => a.status !== "CLOSED");
  const allSelected = selectable.length > 0 && selectable.every((a) => selected.has(a.id));
  const selectedPaused = selectable.filter((a) => selected.has(a.id) && a.status === "PAUSED").map((a) => a.id);
  const selectedOpen = selectable.filter((a) => selected.has(a.id) && a.status === "OPEN").map((a) => a.id);

  const pill = "bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 flex items-center gap-2";
  const selectCls = "font-semibold bg-transparent dark:text-white outline-none cursor-pointer";

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Top Navbar Simulation (Global para P2P) */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4 mb-2 pb-3 md:pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex gap-6 text-sm font-medium">
          <button onClick={() => router.push('/dashboard/p2p/express')} className="text-zinc-500 hover:text-emerald-500 transition-colors">Rápido</button>
          <button onClick={() => router.push('/dashboard/p2p')} className="text-emerald-600 dark:text-emerald-400 relative">
            Cuenta P2P
            <span className="hidden md:block absolute -bottom-4.5 left-0 right-0 h-0.5 bg-emerald-500 rounded-t-full"></span>
          </button>
        </div>
        
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 sm:gap-6 text-sm font-medium items-center relative">
          <button onClick={() => router.push('/dashboard/p2p/orders')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Órdenes</button>
          <button onClick={() => router.push('/dashboard/p2p/orders')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors flex items-center gap-1">Chat {activeCount > 0 && <span className="bg-amber-400 text-amber-900 text-[10px] font-black px-1.5 py-0.5 rounded-md">{activeCount}</span>}</button>
          <button onClick={() => router.push('/dashboard/p2p/user-center')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Centro de usuario</button>
          <button onClick={() => router.push('/dashboard/p2p/payment-methods')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Métodos de pago</button>
        </div>
      </div>

      {/* Header Mis anuncios */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Mis anuncios</h1>
        <button 
          onClick={() => router.push('/dashboard/p2p/post-ad')}
          className="px-6 py-2 bg-amber-400 hover:bg-amber-500 text-amber-950 text-sm font-bold rounded-lg transition-colors"
        >
          Publicar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 text-sm font-medium border-b border-zinc-100 dark:border-zinc-800 pb-2">
        <button 
          onClick={() => setActiveTab("REGULAR")}
          className={`relative pb-2 transition-colors ${activeTab === "REGULAR" ? "text-amber-500 font-bold" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"}`}
        >
          Anuncios regulares
          {activeTab === "REGULAR" && <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full"></span>}
        </button>
        <button 
          onClick={() => setActiveTab("PREMIUM")}
          className={`relative pb-2 transition-colors ${activeTab === "PREMIUM" ? "text-amber-500 font-bold" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"}`}
        >
          Anuncios Prémium
          {activeTab === "PREMIUM" && <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full"></span>}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className={pill}>
          <span className="text-zinc-500">Moneda/Tipo</span>
          <span className="font-semibold dark:text-white">USDT/VES</span>
        </div>
        <div className={pill}>
          <span className="text-zinc-500">Tipo</span>
          <select id="myads-filter-side" value={draft.side} onChange={(e) => setDraft({ ...draft, side: e.target.value })} className={selectCls}>
            <option value="ALL">Todas</option>
            <option value="BUY">Compra</option>
            <option value="SELL">Venta</option>
          </select>
        </div>
        <div className={pill}>
          <span className="text-zinc-500">Estado</span>
          <select id="myads-filter-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={selectCls}>
            <option value="ALL">Todas</option>
            <option value="OPEN">Online</option>
            <option value="PAUSED">Pausado</option>
            <option value="CLOSED">Cerrado</option>
          </select>
        </div>
        <div className={`${pill} text-zinc-500`}>
          <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="bg-transparent outline-none dark:text-white" />
          <span className="mx-1">→</span>
          <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="bg-transparent outline-none dark:text-white" />
        </div>
        <button id="myads-filter-apply" onClick={() => setFilters(draft)} className="px-6 py-1.5 bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold rounded-lg transition-colors">
          Filtrar
        </button>
        <button
          onClick={() => {
            const reset = { side: "ALL", status: "ALL", from: "", to: "" };
            setDraft(reset);
            setFilters(reset);
          }}
          className="px-6 py-1.5 text-amber-500 hover:text-amber-600 font-bold transition-colors"
        >
          Reiniciar
        </button>
      </div>

      <div className="flex items-center gap-2 text-zinc-500 text-sm font-medium">
        <FileText className="w-4 h-4" /> Historial de anuncios
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((a) => a.id)) : new Set())}
            className="rounded border-zinc-300 dark:border-zinc-700 bg-transparent"
          />
          <span className="text-zinc-500">({filteredAds.length})</span>
        </div>
        <button
          disabled={selectedPaused.length === 0 || busyId === "bulk"}
          onClick={() => runStatus(selectedPaused, "RESUME")}
          className={`px-4 py-1.5 rounded-md transition-colors ${selectedPaused.length > 0 ? "bg-amber-400 text-amber-950" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"}`}
        >
          Publicar
        </button>
        <button
          disabled={selectedOpen.length === 0 || busyId === "bulk"}
          onClick={() => runStatus(selectedOpen, "PAUSE")}
          className={`px-4 py-1.5 rounded-md transition-colors ${selectedOpen.length > 0 ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"}`}
        >
          Desactivar todo
        </button>
      </div>

      {/* Empty State */}
      {loading ? (
        <div className="text-center py-24 text-zinc-500">Cargando anuncios...</div>
      ) : filteredAds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
          <div className="w-16 h-20 border-2 border-zinc-300 dark:border-zinc-700 rounded-lg relative flex items-center justify-center mb-4">
            <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
              <span className="font-serif text-xl font-bold">!</span>
            </div>
            <div className="absolute -bottom-2 -right-2 bg-zinc-900 rounded-full border border-zinc-800">
              <span className="block w-4 h-4 bg-zinc-700 rounded-full m-0.5"></span>
            </div>
          </div>
          <p className="text-sm font-medium mb-6">Aún no tienes anuncios en esta categoría</p>
          <button 
            onClick={() => router.push('/dashboard/p2p/post-ad')}
            className="px-8 py-2 bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold rounded-lg transition-colors"
          >
            Publicar
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto no-scrollbar">
          <div className="min-w-[900px]">
            {/* Table Headers */}
            <div className="grid grid-cols-6 gap-4 text-xs text-zinc-500 border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-4">
              <div>Número de anuncio<br/>Tipo<br/>Activo/Fiat</div>
              <div>Monto disponible<br/>Completar Trade QTY.<br/>Límite de la orden</div>
              <div>Precio<br/>vs. Binance P2P</div>
              <div>Método de pago</div>
              <div>Última actualización<br/>Hora de creación</div>
              <div className="flex justify-between">
                <span>Estado</span>
                <span>Acciones</span>
              </div>
            </div>

            <div className="space-y-4">
              {filteredAds.map((ad) => {
                const st = STATUS_LABEL[ad.status] ?? { t: ad.status, c: "text-zinc-400" };
                const diff = refPrice ? ((ad.price - refPrice) / refPrice) * 100 : null;
                const busy = busyId === ad.id;
                return (
                  <div key={ad.id} className={`grid grid-cols-6 gap-4 text-sm items-center py-4 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${ad.status === "CLOSED" ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-2">
                  {ad.status !== "CLOSED" && (
                    <input
                      type="checkbox"
                      checked={selected.has(ad.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(ad.id);
                        else next.delete(ad.id);
                        setSelected(next);
                      }}
                      className="mt-1 rounded border-zinc-300 dark:border-zinc-700 bg-transparent"
                    />
                  )}
                  <div>
                    <span className="text-emerald-500">{ad.id.slice(-8).toUpperCase()}</span><br/>
                    <span className={`font-bold ${ad.type.startsWith("BUY") ? "text-emerald-600" : "text-rose-600"}`}>
                      {ad.type.startsWith("BUY") ? "Compra" : "Venta"} 
                      {ad.type.includes("PREMIUM") ? " ⭐" : ""}
                    </span><br/>
                    <span className="text-zinc-500">USDT/VES</span>
                  </div>
                </div>
                <div>
                  <span className="font-medium dark:text-zinc-50">{ad.amount.toFixed(2)} USDT</span><br/>
                  <span className="text-zinc-500">{ad.completedQty.toFixed(2)} USDT · {ad.completedCount} órdenes</span><br/>
                  <span className="text-zinc-500">{ad.minAmount.toLocaleString()} - {ad.maxAmount.toLocaleString()} VES</span>
                </div>
                <div>
                  <span className="font-bold dark:text-zinc-50">{ad.price.toFixed(3)} VES</span><br/>
                  <span className={`text-xs ${diff == null ? "text-zinc-500" : diff > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                    {diff == null ? "—" : `${diff > 0 ? "+" : ""}${diff.toFixed(2)}%`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {ad.methods.split(",").map((m) => (
                    <span key={m} className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 px-2 py-1 rounded text-xs">
                      {m.trim()}
                    </span>
                  ))}
                </div>
                <div className="text-zinc-500 text-xs">
                  {new Date(ad.updatedAt).toLocaleString()}<br/>
                  {new Date(ad.createdAt).toLocaleString()}
                </div>
                <div className="flex justify-between items-center pr-4 gap-2">
                  <div className="flex flex-col">
                    <span className={`${st.c} font-medium`}>{st.t}</span>
                    {ad.activeTrades > 0 && <span className="text-[11px] text-zinc-500">{ad.activeTrades} en curso</span>}
                  </div>
                  {ad.status !== "CLOSED" && (
                    <div className="flex flex-col items-end gap-1 text-xs">
                      {busy ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                      ) : (
                        <>
                          <button onClick={() => runStatus([ad.id], ad.status === "OPEN" ? "PAUSE" : "RESUME")} className="text-amber-500 hover:underline">
                            {ad.status === "OPEN" ? "Ocultar" : "Publicar"}
                          </button>
                          <button onClick={() => openEdit(ad)} className="text-zinc-500 hover:underline">Editar</button>
                          <button onClick={() => setClosing(ad)} className="text-rose-500 hover:underline">Cerrar</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
            </div>
          </div>
        </div>
      )}

      {/* Confirmar cierre */}
      <AnimatePresence>
        {closing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setClosing(null)} className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-2">¿Cerrar anuncio {closing.id.slice(-8).toUpperCase()}?</h3>
              <p className="text-sm text-zinc-500 mb-6">
                El anuncio dejará de mostrarse en el mercado de forma permanente.
                {closing.type.startsWith("SELL") && closing.amount > 0 && ` Los ${closing.amount.toFixed(2)} USDT restantes volverán a tu billetera.`}
                {closing.activeTrades > 0 && " Las órdenes en curso continuarán normalmente hasta finalizar."}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setClosing(null)} className="flex-1 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 font-bold text-zinc-700 dark:text-zinc-300">Volver</button>
                <button
                  onClick={async () => {
                    const id = closing.id;
                    setClosing(null);
                    await runStatus([id], "CLOSE");
                  }}
                  className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
                >
                  Cerrar anuncio
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Editar anuncio */}
      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditing(null)} className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Editar anuncio</h3>
                <button onClick={() => setEditing(null)} className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500"><X className="w-4 h-4" /></button>
              </div>
              {[
                { k: "price", label: "Precio (VES por USDT)" },
                { k: "minAmount", label: "Límite mínimo por orden (VES)" },
                { k: "maxAmount", label: "Límite máximo por orden (VES)" },
              ].map((f) => (
                <div key={f.k}>
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">{f.label}</label>
                  <input
                    type="number"
                    value={editForm[f.k as "price"]}
                    onChange={(e) => setEditForm({ ...editForm, [f.k]: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-zinc-900 dark:text-zinc-50 outline-none focus:border-amber-400"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Métodos de pago (separados por coma, máx. 5)</label>
                <input
                  value={editForm.methods}
                  onChange={(e) => setEditForm({ ...editForm, methods: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-zinc-900 dark:text-zinc-50 outline-none focus:border-amber-400"
                />
              </div>
              <button onClick={saveEdit} disabled={busyId === editing.id} className="w-full py-3 rounded-2xl bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {busyId === editing.id && <Loader2 className="w-4 h-4 animate-spin" />} Guardar cambios
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md">
            <div className={`p-4 rounded-2xl shadow-xl border backdrop-blur-md flex items-start gap-3 text-white ${toast.ok ? "bg-emerald-500/90 border-emerald-400" : "bg-rose-500/90 border-rose-400"}`}>
              {toast.ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <div className="flex-1 text-sm font-medium">{toast.text}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
