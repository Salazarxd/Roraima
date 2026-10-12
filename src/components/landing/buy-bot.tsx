"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, LogIn, ShieldCheck, Sparkles, UserPlus, Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { Mascot, SpeechBubble } from "@/components/mascot";
import { useSignedIn } from "./landing-data";

type Unit = "VES" | "USDT";
type Phase = "ask" | "amount" | "login" | "going";

const SEEN_KEY = "rori_greeted";
const CHIPS: Record<Unit, number[]> = { VES: [5000, 10000, 20000, 50000], USDT: [10, 25, 50, 100] };

const fmt = (n: number) => n.toLocaleString("es-VE");

/** URL de la Compra rápida con lo que eligió el usuario (el cálculo real se hace allí, con sesión). */
export const expressBuyUrl = (amount: number, unit: Unit) => `/dashboard/p2p/express?amount=${encodeURIComponent(String(amount))}&unit=${unit}`;

/**
 * Asistente de compra de la portada. Rori pregunta cuánto quiere comprar y si lo calcula en
 * bolívares o en USDT. NO muestra la conversión aquí: con sesión lleva a la Compra rápida
 * (anuncio promocionado VIP + detalles); sin sesión pide iniciar sesión para continuar.
 */
export function BuyBot() {
  const router = useRouter();
  const signedIn = useSignedIn();
  const [firstVisit, setFirstVisit] = React.useState<boolean | null>(null);
  const [phase, setPhase] = React.useState<Phase>("ask");
  const [unit, setUnit] = React.useState<Unit>("VES");
  const [amount, setAmount] = React.useState("");
  const [typing, setTyping] = React.useState(true);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Primera vez: Rori se presenta. Las siguientes, un saludo corto.
  React.useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* modo privado */
    }
    setFirstVisit(!seen);
  }, []);

  React.useEffect(() => {
    if (phase === "amount") setTimeout(() => inputRef.current?.focus(), 250);
  }, [phase, unit]);

  const num = parseFloat(amount.replace(",", ".")) || 0;
  const target = num > 0 ? expressBuyUrl(num, unit) : "/dashboard/p2p/express";

  const message =
    phase === "ask"
      ? firstVisit
        ? "¡Hola! Soy Rori, tu asistente P2P 👋 ¿Cuánto quieres comprar?"
        : "¡Hola de nuevo! 👋 ¿Cuánto quieres comprar hoy?"
      : phase === "amount"
        ? unit === "VES"
          ? "¡Perfecto! ¿Cuántos bolívares quieres usar?"
          : "¡Genial! ¿Cuántos USDT quieres recibir?"
        : phase === "login"
          ? "¡Casi listo! Inicia sesión y te muestro la mejor oferta para ti 🔍"
          : "¡Buscando la mejor oferta para ti! 🚀";

  const pickUnit = (u: Unit) => {
    setUnit(u);
    setAmount("");
    setPhase("amount");
  };

  const next = () => {
    if (!num) return;
    if (signedIn || auth.currentUser) {
      setPhase("going");
      router.push(target);
    } else {
      setPhase("login");
    }
  };

  const onTyping = React.useCallback((t: boolean) => setTyping(t), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.35, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-md"
    >
      <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-tr from-brand-gold/25 via-brand-red/15 to-brand-blue/25 blur-2xl" />
      <div className="border-shine relative rounded-[2rem] bg-white/85 dark:bg-zinc-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-2xl shadow-zinc-900/10 dark:shadow-black/50 p-5 sm:p-7">
        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" /> Comprar USDT
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
              <span className="relative w-2 h-2 rounded-full bg-emerald-500" />
            </span>
            Rori en línea
          </span>
        </div>

        {/* Rori + globo */}
        <div className="mt-5 flex items-end gap-3 min-h-[124px]">
          {firstVisit !== null && (
            <>
              <Mascot size={96} wave={phase === "ask"} talking={typing} />
              <div className="flex-1 pb-6">
                <SpeechBubble text={message} onTyping={onTyping} className="text-[15px]" />
              </div>
            </>
          )}
        </div>

        {/* Pasos */}
        <div className="mt-4 min-h-[214px]">
          <AnimatePresence mode="wait">
            {phase === "ask" && firstVisit !== null && (
              <motion.div key="ask" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ delay: 0.5 }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">¿Cómo lo calculamos?</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(
                    [
                      { u: "VES" as const, title: "En bolívares", sub: "Según lo que vas a pagar" },
                      { u: "USDT" as const, title: "En USDT", sub: "Según lo que vas a recibir" },
                    ]
                  ).map((o, i) => (
                    <motion.button
                      key={o.u}
                      id={`rori-unit-${o.u.toLowerCase()}`}
                      initial={{ opacity: 0, y: 14, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.6 + i * 0.12, type: "spring", stiffness: 300, damping: 22 }}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => pickUnit(o.u)}
                      className="group text-left rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 hover:border-emerald-500/60 hover:shadow-lg hover:shadow-emerald-500/10 transition-[border-color,box-shadow]"
                    >
                      <CoinIcon unit={o.u} big />
                      <span className="mt-3 block font-bold text-zinc-900 dark:text-white">{o.title}</span>
                      <span className="mt-0.5 block text-xs text-zinc-500 leading-snug">{o.sub}</span>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        Elegir <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {phase === "amount" && (
              <motion.div key={`amount-${unit}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
                <label htmlFor="rori-amount" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {unit === "VES" ? "Bolívares que vas a pagar" : "USDT que quieres recibir"}
                </label>
                <div className="mt-2 flex items-center gap-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 px-4 py-3.5 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
                  <input
                    ref={inputRef}
                    id="rori-amount"
                    inputMode="decimal"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => {
                      // Solo dígitos y UN separador decimal (punto o coma), máx. 2 decimales
                      const v = e.target.value.replace(/[^0-9.,]/g, "").replace(/([.,])(?=.*[.,])/g, "");
                      const [int, dec] = v.split(/[.,]/);
                      setAmount((dec !== undefined ? `${int}${v.match(/[.,]/)![0]}${dec.slice(0, 2)}` : int).slice(0, 12));
                    }}
                    onKeyDown={(e) => e.key === "Enter" && next()}
                    className="min-w-0 flex-1 bg-transparent text-3xl font-bold tracking-tight text-zinc-900 dark:text-white outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
                  />
                  <span className="shrink-0 inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 shadow-sm">
                    <CoinIcon unit={unit} />
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{unit === "VES" ? "Bs" : "USDT"}</span>
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CHIPS[unit].map((c) => (
                    <button
                      key={c}
                      onClick={() => setAmount(String(c))}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                        num === c
                          ? "bg-emerald-500 border-emerald-500 text-zinc-950"
                          : "border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-emerald-500/60"
                      }`}
                    >
                      {fmt(c)} {unit === "VES" ? "Bs" : "USDT"}
                    </button>
                  ))}
                </div>
                <motion.button
                  id="rori-continue"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={next}
                  disabled={!num}
                  className="mt-5 w-full inline-flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-lg shadow-lg shadow-emerald-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continuar <ArrowRight className="w-5 h-5" />
                </motion.button>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <button onClick={() => setPhase("ask")} className="inline-flex items-center gap-1 font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                    <ArrowLeft className="w-3.5 h-3.5" /> Atrás
                  </button>
                  <button onClick={() => pickUnit(unit === "VES" ? "USDT" : "VES")} className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                    Calcular en {unit === "VES" ? "USDT" : "bolívares"}
                  </button>
                </div>
              </motion.div>
            )}

            {phase === "login" && (
              <motion.div key="login" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
                <div className="rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 flex items-center gap-3">
                  <CoinIcon unit={unit} big />
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500">Quieres comprar</p>
                    <p className="font-bold text-lg text-zinc-900 dark:text-white truncate">
                      {fmt(num)} {unit === "VES" ? "Bs en USDT" : "USDT"}
                    </p>
                  </div>
                  <button onClick={() => setPhase("amount")} className="ml-auto text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                    Editar
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <Link
                    id="rori-login"
                    href={`/auth?next=${encodeURIComponent(target)}`}
                    className="group inline-flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-lg shadow-lg shadow-emerald-500/25 transition-all hover:-translate-y-0.5"
                  >
                    <LogIn className="w-5 h-5" /> Iniciar sesión para continuar
                  </Link>
                  <Link
                    id="rori-register"
                    href={`/auth?modo=registro&next=${encodeURIComponent(target)}`}
                    className="inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-100 font-bold hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <UserPlus className="w-4 h-4" /> ¿No tienes cuenta? Créala gratis
                  </Link>
                </div>
              </motion.div>
            )}

            {phase === "going" && (
              <motion.div key="going" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-[214px] flex flex-col items-center justify-center gap-3 text-zinc-500">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <span className="text-sm font-semibold">Abriendo Compra rápida…</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Los USDT del vendedor quedan bloqueados en Escrow
        </p>
      </div>
    </motion.div>
  );
}

function CoinIcon({ unit, big = false }: { unit: Unit; big?: boolean }) {
  const s = big ? "w-10 h-10 text-sm" : "w-6 h-6 text-[10px]";
  return unit === "USDT" ? (
    <span className={`${s} shrink-0 rounded-full bg-[#26a17b] text-white font-black flex items-center justify-center shadow-sm`}>₮</span>
  ) : (
    <span className={`${s} shrink-0 rounded-full bg-gradient-to-b from-brand-gold via-brand-blue to-brand-red text-white font-black flex items-center justify-center shadow-sm`}>Bs</span>
  );
}
