"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  UserX,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Unlock
} from "lucide-react";
import {
  getBlockedUsers,
  unblockUser
} from "@/app/actions/blacklist";

type BlockedUser = {
  id: string;
  name: string;
  blockedAt: string;
};

export default function BlacklistPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [blocked, setBlocked] = React.useState<BlockedUser[]>([]);
  const [toast, setToast] = React.useState<{ type: "error" | "success"; text: string } | null>(null);

  const showToast = (type: "error" | "success", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const load = React.useCallback(async () => {
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const res = await getBlockedUsers(await getIdToken());
      if (res.success) {
        setBlocked(res.blocks);
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

  const handleUnblock = async (targetId: string, name: string) => {
    if (!confirm(`¿Desbloquear a ${name}? Volverás a ver sus anuncios en P2P.`)) return;
    setBusy(true);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const res = await unblockUser(await getIdToken(), targetId);
      if (res.success) {
        showToast("success", "Usuario desbloqueado");
        setBlocked(prev => prev.filter(b => b.id !== targetId));
      } else {
        showToast("error", res.error);
      }
    } catch {
      showToast("error", "Error de red");
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
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Usuarios Bloqueados</h1>
          <p className="text-zinc-500 mt-1 text-sm">Gestiona los usuarios con los que no deseas operar en P2P</p>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60">
        {blocked.length === 0 ? (
          <div className="text-center py-12 px-4">
            <UserX className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
            <h4 className="text-zinc-900 dark:text-zinc-50 font-semibold mb-1">No tienes usuarios bloqueados</h4>
            <p className="text-zinc-500 text-sm">Los usuarios que bloquees en P2P aparecerán aquí.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {blocked.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                <div className="min-w-0 pr-4">
                  <div className="font-bold text-zinc-900 dark:text-zinc-50 truncate">{u.name}</div>
                  <div className="text-sm text-zinc-500 truncate mt-0.5">Bloqueado el {new Date(u.blockedAt).toLocaleDateString()}</div>
                </div>
                <button
                  onClick={() => handleUnblock(u.id, u.name)}
                  disabled={busy}
                  className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 rounded-xl transition-colors shrink-0 disabled:opacity-50"
                  title="Desbloquear usuario"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Unlock className="w-5 h-5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
