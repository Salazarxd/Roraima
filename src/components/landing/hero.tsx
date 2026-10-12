"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Lock, Smartphone, BadgeCheck } from "lucide-react";
import { REGISTER_URL } from "./landing-data";
import { BuyBot } from "./buy-bot";
import { useSystemSettings } from "@/components/settings-provider";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.08 * i, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } }),
};

export function LandingHero() {
  const settings = useSystemSettings();
  return (
    <section className="relative overflow-hidden pt-28 md:pt-36 pb-20 md:pb-28">
      {/* Fondo: aurora con los colores del emblema + cuadrícula */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute -top-40 -left-32 w-[38rem] h-[38rem] rounded-full bg-brand-gold/25 dark:bg-brand-gold/15 blur-[120px] animate-aurora" />
        <div className="absolute top-10 -right-40 w-[34rem] h-[34rem] rounded-full bg-brand-blue/25 dark:bg-brand-blue/20 blur-[120px] animate-aurora [animation-delay:-6s]" />
        <div className="absolute -bottom-40 left-1/3 w-[30rem] h-[30rem] rounded-full bg-brand-red/20 dark:bg-brand-red/15 blur-[120px] animate-aurora [animation-delay:-12s]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-zinc-50 dark:to-zinc-950" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-14 lg:gap-10 items-center">
          {/* Texto */}
          <motion.div initial="hidden" animate="show" className="text-center lg:text-left">
            <motion.div
              variants={fadeUp}
              custom={0}
              className="inline-flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full bg-white/70 dark:bg-white/5 border border-zinc-200/80 dark:border-white/10 backdrop-blur shadow-sm"
            >
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500 text-zinc-950">NUEVO</span>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Avisos en tiempo real en cada orden</span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              custom={1}
              className="mt-6 text-[2.6rem] leading-[1.05] sm:text-6xl lg:text-[3.6rem] xl:text-7xl font-black tracking-tight text-zinc-900 dark:text-white"
            >
              {settings.heroTitle}
              
              <span className="relative inline-block">
                
                <svg aria-hidden viewBox="0 0 300 20" className="absolute left-0 -bottom-2 w-full h-3 text-brand-gold/70" preserveAspectRatio="none">
                  <motion.path
                    d="M2 14 C 80 4, 180 4, 298 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.9, duration: 1.1, ease: "easeInOut" }}
                  />
                </svg>
              </span>
            </motion.h1>

            <motion.p variants={fadeUp} custom={2} className="mt-7 text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              El mercado P2P hecho para Venezuela. Tus USDT quedan protegidos en <b className="text-zinc-900 dark:text-white font-semibold">Escrow</b> hasta
              que el pago llegue a tu banco. Pago Móvil y transferencias, sin intermediarios.
            </motion.p>

            <motion.div variants={fadeUp} custom={3} className="mt-9 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link
                href={REGISTER_URL}
                id="hero-register"
                className="group relative inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-lg shadow-xl shadow-emerald-500/30 transition-all hover:-translate-y-0.5 overflow-hidden"
              >
                <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.45)_50%,transparent_75%)] bg-[length:250%_100%] animate-shine" />
                <span className="relative">Crear cuenta gratis</span>
                <ArrowRight className="relative w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="#mercado"
                id="hero-market"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-white/80 dark:bg-white/5 backdrop-blur border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white font-bold text-lg hover:bg-white dark:hover:bg-white/10 transition-colors"
              >
                Ver el mercado
              </Link>
            </motion.div>

            <motion.ul variants={fadeUp} custom={4} className="mt-10 flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              {[
                { icon: Lock, text: "Escrow automático" },
                { icon: BadgeCheck, text: "Una cédula, una cuenta" },
                { icon: Smartphone, text: "Pago Móvil y transferencias" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  {text}
                </li>
              ))}
            </motion.ul>
          </motion.div>

          {/* Visual + widget */}
          <div className="relative">
            <HeroOrbit />
            <BuyBot />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Emblema flotando con anillos orbitales detrás del widget. */
function HeroOrbit() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="relative w-[30rem] h-[30rem] max-w-[115vw] opacity-90">
        <div className="absolute inset-0 rounded-full border border-dashed border-zinc-300/70 dark:border-white/10 animate-orbit">
          <span className="absolute -top-1.5 left-1/2 w-3 h-3 rounded-full bg-brand-gold shadow-[0_0_20px] shadow-brand-gold" />
        </div>
        <div className="absolute inset-12 rounded-full border border-zinc-300/60 dark:border-white/10 animate-orbit-reverse">
          <span className="absolute top-1/2 -right-1.5 w-2.5 h-2.5 rounded-full bg-brand-blue shadow-[0_0_20px] shadow-brand-blue" />
          <span className="absolute bottom-6 left-8 w-2 h-2 rounded-full bg-brand-red shadow-[0_0_16px] shadow-brand-red" />
        </div>
        <img src="/emblem.webp" alt="" className="absolute -top-6 -right-2 md:-right-6 w-28 h-28 md:w-36 md:h-36 object-contain animate-float drop-shadow-[0_20px_40px_rgba(47,107,255,0.35)]" />
      </div>
    </div>
  );
}
