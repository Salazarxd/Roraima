"use client";

import React, { useEffect, useState } from "react";
import { WifiOff, Wifi, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { triggerHaptic } from "@/lib/haptics";

export function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [showRestored, setShowRestored] = useState<boolean>(false);

  useEffect(() => {
    // Inicializar estado del navegador
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }

    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      triggerHaptic(20);
      const timer = setTimeout(() => {
        setShowRestored(false);
        setWasOffline(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      setShowRestored(false);
      triggerHaptic([40, 50, 40]);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          key="offline-banner"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed top-3 inset-x-0 z-[120] flex justify-center px-4 pointer-events-none"
        >
          <div className="pointer-events-auto max-w-md w-full bg-amber-600/90 dark:bg-amber-500/90 backdrop-blur-xl text-white px-4 py-2.5 rounded-full shadow-2xl shadow-amber-950/20 border border-amber-400/40 flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping shrink-0" />
              <WifiOff className="w-4 h-4 shrink-0 text-amber-100" />
              <span className="truncate">
                Sin conexión a internet · Digitel / CANTV reconectando...
              </span>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="p-1 rounded-full hover:bg-white/20 active:scale-95 transition-transform shrink-0"
              title="Reintentar ahora"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {isOnline && showRestored && wasOffline && (
        <motion.div
          key="restored-banner"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed top-3 inset-x-0 z-[120] flex justify-center px-4 pointer-events-none"
        >
          <div className="pointer-events-auto bg-emerald-600/90 dark:bg-emerald-500/90 backdrop-blur-xl text-white px-5 py-2.5 rounded-full shadow-2xl shadow-emerald-950/20 border border-emerald-400/40 flex items-center gap-2.5 text-xs sm:text-sm font-bold">
            <Wifi className="w-4 h-4 text-emerald-100" />
            <span>¡Conexión a internet restablecida!</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
