"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Mascot, SpeechBubble } from "@/components/mascot";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export function GlobalMascot() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    // Generate context-sensitive message
    let msg = "¡Hola! Soy Rori. Estoy aquí para ayudarte en lo que necesites.";
    if (pathname === "/dashboard") {
      msg = "¡Bienvenido a tu panel! Aquí puedes ver tus saldos de forma segura, depositar, retirar o transferir. ¡Haz clic en el ojito para ocultar tus fondos!";
    } else if (pathname.includes("/dashboard/p2p/express")) {
      msg = "Estás en P2P Rápido. Ingresa el monto y buscaremos automáticamente al vendedor más confiable y rápido para ti.";
    } else if (pathname.includes("/dashboard/p2p/orders")) {
      msg = "En esta sección puedes gestionar todas tus órdenes activas y chatear con las contrapartes. Recuerda marcar 'Pagado' ¡SOLO CUANDO HAYAS TRANSFERIDO!";
    } else if (pathname.includes("/dashboard/p2p/my-ads")) {
      msg = "Tus anuncios de compra y venta están aquí. Mantén tus precios actualizados para atraer más operaciones.";
    } else if (pathname.includes("/dashboard/p2p/user-center")) {
      msg = "En tu centro de usuario puedes ver tus estadísticas como comerciante y configurar tus métodos de pago.";
    } else if (pathname.includes("/dashboard/p2p")) {
      msg = "¡Mercado P2P! Encuentra las mejores ofertas para comprar o vender USDT. Usa los filtros para buscar rápidamente.";
    }
    
    // Only update and auto-open if the message changed
    setMessage((prev) => {
      if (prev !== msg) {
        setOpen(true);
        setTyping(true);
      }
      return msg;
    });
  }, [pathname]);

  // Auto-close after some time
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setOpen(false), 9000);
    return () => clearTimeout(id);
  }, [open, message]);

  // Si estamos en la vista de compra rápida con Rori en grande, ocultamos la versión flotante para no duplicar.
  if (pathname === "/dashboard/p2p/express") return null;

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] md:bottom-6 right-[4.5rem] md:right-[6rem] z-[60] flex flex-row-reverse items-end gap-2 pointer-events-none max-w-[85vw] md:max-w-sm">
      <div 
        className="pointer-events-auto cursor-pointer drop-shadow-xl hover:scale-105 transition-transform shrink-0"
        onClick={() => {
          if (!open) { setTyping(true); setOpen(true); }
          else setOpen(false);
        }}
      >
        <Mascot size={75} mobileSize={65} talking={open && typing} wave={!open} />
      </div>
      <AnimatePresence>
        {open && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, x: 10, originX: 1, originY: 1 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 10 }}
            className="pointer-events-auto relative pb-6 flex-1 min-w-0"
          >
            <SpeechBubble text={message} onTyping={setTyping} className="text-sm shadow-xl" />
            <button onClick={() => setOpen(false)} className="absolute top-1 right-1 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-700/50 rounded-full shadow-sm transition-colors z-10">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
