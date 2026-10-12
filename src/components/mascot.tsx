"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/**
 * Rori, la mascota de Roraima. Imagen con transparencia (public/mascot.webp) animada:
 * entrada con rebote, flotación continua, saludo y "habla" (balanceo) mientras escribe.
 */
export function Mascot({
  size = 120,
  mobileSize,
  talking = false,
  wave = false,
  className = "",
}: {
  size?: number;
  /** Tamaño en pantallas pequeñas (< 640px). Por defecto ~75% de `size`. */
  mobileSize?: number;
  talking?: boolean;
  wave?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ms = mobileSize ?? Math.round(size * 0.75);
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -40, scale: 0.4, rotate: -18 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.15 }}
      className={`relative shrink-0 aspect-[100/116] w-[calc(var(--ms)*1px)] sm:w-[calc(var(--ds)*1px)] ${className}`}
      style={{ "--ms": ms, "--ds": size } as React.CSSProperties}
      aria-hidden
    >
      {/* Halo */}
      <div className="absolute inset-x-2 bottom-1 top-6 rounded-full bg-brand-gold/30 dark:bg-brand-gold/20 blur-2xl" />
      {/* Llamas de los propulsores */}
      <span className="absolute bottom-0 left-[38%] w-2 h-4 rounded-full bg-gradient-to-b from-cyan-300 to-transparent blur-[2px] animate-[jet_0.35s_ease-in-out_infinite_alternate]" />
      <span className="absolute bottom-0 left-[55%] w-2 h-4 rounded-full bg-gradient-to-b from-cyan-300 to-transparent blur-[2px] animate-[jet_0.35s_ease-in-out_infinite_alternate] [animation-delay:-0.17s]" />
      {/* Cuerpo flotando */}
      <motion.div
        className="relative w-full h-full"
        animate={reduce ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.img
          src="/mascot.webp"
          alt=""
          draggable={false}
          className="w-full h-full object-contain select-none drop-shadow-[0_14px_24px_rgba(0,0,0,0.25)]"
          style={{ transformOrigin: "50% 85%" }}
          animate={
            reduce
              ? undefined
              : wave
                ? { rotate: [0, -7, 6, -5, 4, 0] }
                : talking
                  ? { rotate: [0, -2.5, 2.5, 0], scale: [1, 1.02, 1] }
                  : { rotate: 0, scale: 1 }
          }
          transition={wave ? { duration: 1.4, delay: 0.6 } : { duration: 0.6, repeat: talking ? Infinity : 0 }}
        />
      </motion.div>
    </motion.div>
  );
}

/** Texto que se escribe letra a letra. Llama a onDone al terminar. */
export function useTypewriter(text: string, speed = 22, onDone?: () => void) {
  const reduce = useReducedMotion();
  const [out, setOut] = React.useState(reduce ? text : "");
  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;

  React.useEffect(() => {
    if (reduce) {
      setOut(text);
      doneRef.current?.();
      return;
    }
    setOut("");
    const chars = Array.from(text); // por caracteres completos: no corta emojis a la mitad
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setOut(chars.slice(0, i).join(""));
      if (i >= chars.length) {
        window.clearInterval(id);
        doneRef.current?.();
      }
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed, reduce]);

  return { text: out, typing: out.length < text.length };
}

/** Globo de diálogo de la mascota (se re-escribe cada vez que cambia `text`). */
export function SpeechBubble({ text, onTyping, className = "" }: { text: string; onTyping?: (typing: boolean) => void; className?: string }) {
  const { text: shown, typing } = useTypewriter(text);
  const onTypingRef = React.useRef(onTyping);
  React.useEffect(() => { onTypingRef.current = onTyping; }, [onTyping]);
  React.useEffect(() => { onTypingRef.current?.(typing); }, [typing]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={text}
        initial={{ opacity: 0, scale: 0.85, x: -8 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
        className={`relative origin-left rounded-2xl rounded-bl-md px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-white/10 shadow-lg shadow-zinc-900/5 ${className}`}
        role="status"
        aria-live="polite"
      >
        {/* Texto completo invisible para reservar el espacio y evitar saltos */}
        <span className="invisible block font-semibold leading-snug">{text}</span>
        <span className="absolute inset-0 px-4 py-3 font-semibold leading-snug text-zinc-900 dark:text-white">
          {shown}
          {typing && <span className="inline-block w-[2px] h-[1em] -mb-[2px] ml-0.5 bg-emerald-500 animate-pulse" />}
        </span>
        <span className="absolute -left-1.5 bottom-2 w-3 h-3 rotate-45 bg-white dark:bg-zinc-800 border-l border-b border-zinc-200/80 dark:border-white/10" />
      </motion.div>
    </AnimatePresence>
  );
}
