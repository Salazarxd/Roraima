"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Loader2,
} from "lucide-react";
import {
  getWhitelist,
  addWhitelistAddress,
  removeWhitelistAddress,
  toggleWhitelist,
} from "@/app/actions/whitelist";

type Address = {
  id: string;
  label: string;
  address: string;
  createdAt: string;
};

export default function WhitelistPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [addresses, setAddresses] = React.useState<Address[]>([]);
  const [enabled, setEnabled] = React.useState(false);
  const [has2FA, setHas2FA] = React.useState(false);

  const [toast, setToast] = React.useState<{ type: "error" | "success"; text: string } | null>(null);

  // Modal State
  const [modalType, setModalType] = React.useState<"ADD" | "DELETE" | "TOGGLE" | null>(null);
  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [newLabel, setNewLabel] = React.useState("");
  const [newAddress, setNewAddress] = React.useState("");
  const [code2FA, setCode2FA] = React.useState("");

  const showToast = (type: "error" | "success", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const load = React.useCallback(async () => {
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const res = await getWhitelist(await getIdToken());
      if (res.success) {
        setAddresses(res.addresses);
        setEnabled(res.whitelistEnabled);
        setHas2FA(res.twoFactorEnabled);
      } else {
        showToast("error", res.error);
      }
    } catch {
      showToast("error", "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    setBusy(true);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const token = await getIdToken();
      let res;
      
      if (modalType === "TOGGLE") {
        res = await toggleWhitelist(token, !enabled, code2FA);
        if (res.success) showToast("success", !enabled ? "Lista blanca activada" : "Lista blanca desactivada");
      } else if (modalType === "ADD") {
        res = await addWhitelistAddress(token, newLabel, newAddress, code2FA);
        if (res.success) showToast("success", "Dirección agregada");
      } else if (modalType === "DELETE" && targetId) {
        res = await removeWhitelistAddress(token, targetId, code2FA);
        if (res.success) showToast("success", "Dirección eliminada");
      }

      if (res?.success) {
        setModalType(null);
        setCode2FA("");
        setNewLabel("");
        setNewAddress("");
        load();
      } else {
        showToast("error", res?.error || "Ocurrió un error");
      }
    } catch {
      showToast("error", "Error de conexión");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-zinc-500">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className={`fixed top-6 left-1/2 z-[100] px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-center gap-3 text-sm font-semibold max-w-[90vw] ${
              toast.type === "error" ? "bg-rose-50/95 border-rose-200 text-rose-700" : "bg-emerald-50/95 border-emerald-200 text-emerald-700"
            }`}
          >
            {toast.type === "error" ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.push("/dashboard/security")} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
          <ArrowLeft className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Lista Blanca (Whitelist)</h1>
          <p className="text-zinc-500 mt-1 text-sm">Gestiona tus direcciones de retiro seguras</p>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-lg">Retiros a direcciones de confianza</h3>
            <p className="text-zinc-500 text-sm mt-1">Si activas esta opción, solo podrás retirar USDT a las direcciones que estén en esta lista.</p>
          </div>
          <button
            onClick={() => setModalType("TOGGLE")}
            className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 ${enabled ? "bg-emerald-600" : "bg-zinc-200 dark:bg-zinc-800"}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? "translate-x-8" : "translate-x-1"}`} />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-lg">Direcciones TRC20</h3>
          <button onClick={() => setModalType("ADD")} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-colors">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>

        {addresses.length === 0 ? (
          <div className="text-center py-12 px-4">
            <ShieldCheck className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
            <h4 className="text-zinc-900 dark:text-zinc-50 font-semibold mb-1">No hay direcciones</h4>
            <p className="text-zinc-500 text-sm">Agrega tu billetera de TrustWallet o Binance para retirar de forma segura.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                <div className="min-w-0 pr-4">
                  <div className="font-bold text-zinc-900 dark:text-zinc-50 truncate">{a.label}</div>
                  <div className="text-sm font-mono text-zinc-500 truncate mt-0.5">{a.address}</div>
                </div>
                <button
                  onClick={() => { setTargetId(a.id); setModalType("DELETE"); }}
                  className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-colors shrink-0"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modalType && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busy && setModalType(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl border border-zinc-100 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
                {modalType === "TOGGLE" && (enabled ? "Desactivar Lista Blanca" : "Activar Lista Blanca")}
                {modalType === "ADD" && "Agregar dirección de retiro"}
                {modalType === "DELETE" && "Eliminar dirección"}
              </h3>
              
              {modalType === "ADD" && (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block">Etiqueta</label>
                    <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Ej: Mi Billetera TrustWallet" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1 block">Dirección TRC20</label>
                    <input type="text" value={newAddress} onChange={e => setNewAddress(e.target.value.trim())} placeholder="T..." className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm font-mono outline-none focus:border-emerald-500" />
                  </div>
                </div>
              )}

              {modalType === "DELETE" && (
                <p className="text-zinc-500 mb-6">¿Estás seguro de que deseas eliminar esta dirección de tu lista blanca?</p>
              )}

              {modalType === "TOGGLE" && (
                <p className="text-zinc-500 mb-6">
                  {enabled ? "Podrás retirar a cualquier dirección nuevamente." : "Por tu seguridad, solo podrás retirar a las direcciones que hayas guardado."}
                </p>
              )}

              {has2FA && (
                <div className="mb-6">
                  <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2"><Lock className="w-4 h-4 text-emerald-600" /> Código 2FA</label>
                  <input
                    type="text"
                    value={code2FA}
                    onChange={(e) => setCode2FA(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-center text-xl tracking-[0.5em] font-mono outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setModalType(null)} disabled={busy} className="flex-1 py-3 rounded-2xl font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Cancelar</button>
                <button 
                  onClick={handleSubmit} 
                  disabled={busy || (has2FA && code2FA.length !== 6) || (modalType === "ADD" && (!newLabel || !newAddress))}
                  className="flex-1 py-3 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {busy ? <Loader2 className="w-5 h-5 mx-auto animate-spin" /> : "Confirmar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
