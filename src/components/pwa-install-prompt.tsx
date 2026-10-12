"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";

const DISMISS_KEY = "pwa_prompt_dismissed_at";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [showPrompt, setShowPrompt] = React.useState(false);

  React.useEffect(() => {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(
          (registration) => {
            console.log('SW registered: ', registration);
          },
          (err) => {
            console.log('SW registration failed: ', err);
          }
        );
      });
    }

    // Handle Install Prompt
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      let recentlyDismissed = false;
      try {
        recentlyDismissed = Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_MS;
      } catch {
        /* modo privado */
      }
      if (!recentlyDismissed) setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    setShowPrompt(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* modo privado */
    }
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-6 left-3 right-3 md:left-auto md:right-6 md:w-[420px] z-[95] flex items-center gap-3 p-3 sm:p-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-3xl shadow-2xl"
        >
          <div className="w-10 h-10 shrink-0 bg-zinc-100 rounded-xl flex items-center justify-center p-1">
            <img src="/logo-transparent.png" alt="Roraima" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-sm truncate">Instalar Roraima</h4>
            <p className="text-xs opacity-70 truncate">Añádela a tu pantalla de inicio</p>
          </div>
          <button 
            onClick={handleInstallClick}
            className="shrink-0 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-full transition-colors flex items-center gap-1"
          >
            <Download className="w-4 h-4" />
            Instalar
          </button>
          <button 
            onClick={dismiss}
            aria-label="Cerrar"
            className="shrink-0 p-1.5 opacity-50 hover:opacity-100 transition-opacity"
          >
            <X className="w-5 h-5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
