"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, BellRing, Trash2, ArrowUpRight, ArrowDownRight, Plus, X, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { hapticTap, hapticSuccess } from "@/lib/haptics";
import { playSuccessSound } from "@/lib/audio-alerts";

type PriceAlert = {
  id: string;
  targetPrice: number;
  direction: string;
  active: boolean;
  createdAt: string | Date;
  triggeredAt: string | Date | null;
};

interface PriceAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRate?: number | null;
}

export function PriceAlertsModal({ isOpen, onClose, currentRate = 0 }: PriceAlertsModalProps) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetPrice, setTargetPrice] = useState("");
  const [direction, setDirection] = useState<"ABOVE" | "BELOW">("ABOVE");
  const [busy, setBusy] = useState(false);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { listPriceAlerts } = await import("@/app/actions/price-alerts");
      const res = await listPriceAlerts(await getIdToken());
      if (res.success) setAlerts(res.alerts);
    } catch {
      // Silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadAlerts();
      if (currentRate && currentRate > 0) {
        setTargetPrice(Math.round(currentRate * 1.05).toString());
      }
    }
  }, [isOpen, loadAlerts, currentRate]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    const num = parseFloat(targetPrice);
    if (isNaN(num) || num <= 0) {
      toast.error("Ingresa un precio válido");
      return;
    }
    setBusy(true);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { createPriceAlert } = await import("@/app/actions/price-alerts");
      const res = await createPriceAlert(await getIdToken(), { targetPrice: num, direction });
      if (res.success) {
        hapticSuccess();
        playSuccessSound();
        toast.success(`Alerta creada: USDT ${direction === "ABOVE" ? "≥" : "≤"} ${num.toFixed(2)} Bs`);
        setTargetPrice("");
        loadAlerts();
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    hapticTap();
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { deletePriceAlert } = await import("@/app/actions/price-alerts");
      const res = await deletePriceAlert(await getIdToken(), id);
      if (res.success) {
        toast.info("Alerta eliminada");
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.94, y: 20, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 rounded-[2.5rem] border border-zinc-200/80 dark:border-emerald-500/30 shadow-2xl p-6 sm:p-7 space-y-5 relative"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Cabecera */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20 shadow-sm">
              <BellRing className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">Alertas de Precio</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Te notificamos cuando el dólar alcance tu objetivo
              </p>
            </div>
          </div>

          {currentRate != null && currentRate > 0 && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 flex justify-between items-center text-xs">
              <span className="text-zinc-500">Tasa de referencia actual:</span>
              <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                1 USDT = {currentRate.toFixed(2)} Bs
              </span>
            </div>
          )}

          {/* Formulario Crear Alerta */}
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-2xl text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  hapticTap();
                  setDirection("ABOVE");
                }}
                className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  direction === "ABOVE"
                    ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm font-black"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Cuando suba de</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  hapticTap();
                  setDirection("BELOW");
                }}
                className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  direction === "BELOW"
                    ? "bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm font-black"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                <ArrowDownRight className="w-4 h-4" />
                <span>Cuando baje de</span>
              </button>
            </div>

            <div className="relative flex items-center">
              <input
                type="number"
                step="any"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="Precio objetivo en Bs (ej: 75.50)"
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 text-sm font-mono font-bold outline-none focus:border-amber-500 text-zinc-900 dark:text-zinc-50"
              />
              <span className="absolute right-4 text-xs font-black text-zinc-400">Bs</span>
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={busy || !targetPrice}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-950/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Crear Alerta de Precio</span>
            </button>
          </div>

          {/* Lista de Alertas Activas */}
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-900">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 pl-1 block">
              Tus alertas configuradas
            </span>
            {loading ? (
              <div className="py-6 flex justify-center text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : alerts.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-4">
                No tienes alertas activas. Configura una arriba para recibir avisos.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {a.direction === "ABOVE" ? (
                        <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div>
                        <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                          {a.direction === "ABOVE" ? "≥" : "≤"} {a.targetPrice.toFixed(2)} Bs
                        </div>
                        <span className="text-[10px] text-zinc-400">
                          {a.active ? "Activa · Esperando" : "Disparada"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500 transition-colors"
                      title="Eliminar alerta"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
