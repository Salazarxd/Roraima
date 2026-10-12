"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Copy, Check, Share2, Users, Coins, Sparkles, X, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { hapticTap, hapticSuccess } from "@/lib/haptics";
import { playCopySound, playSuccessSound } from "@/lib/audio-alerts";

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReferralProgramModal({ isOpen, onClose }: ReferralModalProps) {
  const [data, setData] = useState<{
    referralCode: string | null;
    referralLink: string;
    totalReferred: number;
    commissionEarned: number;
    rewardPercentage: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { getReferralData } = await import("@/app/actions/referrals");
      const res = await getReferralData(await getIdToken());
      if (res.success) {
        setData(res);
      }
    } catch {
      // Silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (!data?.referralLink) return;
    hapticTap();
    playCopySound();
    navigator.clipboard?.writeText(data.referralLink);
    setCopiedLink(true);
    toast.success("Enlace de referido copiado al portapapeles");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    if (!data?.referralCode) return;
    hapticTap();
    playCopySound();
    navigator.clipboard?.writeText(data.referralCode);
    setCopiedCode(true);
    toast.success("Código copiado");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShareWhatsApp = () => {
    if (!data) return;
    hapticSuccess();
    playSuccessSound();

    const text = `🚀 *¡Cambia tus USDT a Bolívares al instante y sin comisiones en Roraima Exchange!*\n\n` +
      `Te invito a unirte a la plataforma P2P más rápida y segura de Venezuela 🇻🇪.\n\n` +
      `🎁 Regístrate con mi enlace oficial:\n${data.referralLink}\n\n` +
      `O usa mi código al crear tu cuenta: *${data.referralCode}*`;

    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({
        title: "Únete a Roraima Exchange",
        text,
      }).catch(() => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
      });
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.93, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.93, y: 20, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 rounded-[2.5rem] border border-zinc-200/80 dark:border-emerald-500/30 shadow-2xl p-6 sm:p-7 space-y-5 relative my-auto"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Banner Ilustrado */}
          <div className="text-center space-y-2 pt-2">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center text-white mx-auto shadow-xl shadow-emerald-500/20">
              <Gift className="w-8 h-8" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-black">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gana 15% de Recompensa</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Programa de Referidos
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
              Invita a tus amigos, familiares o clientes. Cada vez que ellos operen, tú recibes un porcentaje de ganancia directa.
            </p>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="text-xs">Cargando tus recompensas...</span>
            </div>
          ) : (
            <>
              {/* Tarjetas de Estadísticas */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 text-center">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-1.5">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50">
                    {data?.totalReferred ?? 0}
                  </div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                    Amigos Invitados
                  </span>
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 text-center">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-1.5">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    ${data?.commissionEarned?.toFixed(2) ?? "0.00"}
                  </div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                    Ganado (USDT)
                  </span>
                </div>
              </div>

              {/* Tu Código de Referido */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1">
                  Tu Código Único
                </label>
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400 select-all">
                    {data?.referralCode || "Cargando..."}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:text-emerald-500 text-xs font-bold transition-all active:scale-95"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Tu Enlace de Invitación */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1">
                  Enlace de Registro Directo
                </label>
                <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300 truncate select-all pl-1">
                    {data?.referralLink || "..."}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-emerald-500 hover:text-white text-zinc-700 dark:text-zinc-300 text-xs font-bold transition-all shrink-0 active:scale-95"
                  >
                    {copiedLink ? "¡Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>

              {/* Botón WhatsApp */}
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="w-full py-4 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-emerald-950/25 flex items-center justify-center gap-2.5 transition-all active:scale-[0.99]"
              >
                <MessageCircle className="w-4 h-4 fill-current" />
                <span>Invitar Amigos por WhatsApp</span>
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
