"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, BadgeCheck, Bell, ChevronDown, Fingerprint, Gavel, KeyRound, Lock, ScanLine, ShieldCheck,
  Smartphone, Sparkles, TrendingUp, UserPlus, Wallet, Zap, Landmark, Store, LogIn,
} from "lucide-react";
import { CountUp, fmtBs, REGISTER_URL, useLanding, useSignedIn } from "./landing-data";

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: React.ReactNode; subtitle?: string }) {
  return (
    <motion.div {...reveal} className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
        <Sparkles className="w-3.5 h-3.5" /> {eyebrow}
      </span>
      <h2 className="mt-4 text-3xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-white">{title}</h2>
      {subtitle && <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">{subtitle}</p>}
    </motion.div>
  );
}

// ============================================================================
//  Cinta de tasas en vivo
// ============================================================================

export function RatesTicker() {
  const { data } = useLanding();
  const items = [
    { label: "Roraima · Compra", value: data?.market.bestBuy, accent: "text-emerald-500" },
    { label: "Roraima · Venta", value: data?.market.bestSell, accent: "text-rose-500" },
    { label: "Binance P2P", value: data?.rates.binance, accent: "text-brand-gold" },
    { label: "Dólar BCV", value: data?.rates.bcv, accent: "text-brand-blue" },
    { label: "Paralelo", value: data?.rates.parallel, accent: "text-violet-500" },
  ].filter((i): i is { label: string; value: number; accent: string } => i.value != null);

  if (!data) {
    return <div className="h-14 border-y border-zinc-200/70 dark:border-white/10 bg-white/50 dark:bg-white/[0.02] animate-pulse" />;
  }
  if (items.length === 0) return null;

  const row = (dup: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={dup}>
      {items.map((i) => (
        <div key={i.label + dup} className="flex items-center gap-3 px-8">
          <span className={`w-1.5 h-1.5 rounded-full bg-current ${i.accent}`} />
          <span className="text-sm font-medium text-zinc-500 whitespace-nowrap">{i.label}</span>
          <span className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums whitespace-nowrap">{fmtBs(i.value)} Bs</span>
        </div>
      ))}
    </div>
  );

  return (
    <section aria-label="Tasas de referencia en vivo" className="relative border-y border-zinc-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] backdrop-blur overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center gap-2 pl-4 pr-8 bg-gradient-to-r from-white via-white/95 to-transparent dark:from-zinc-950 dark:via-zinc-950/95">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">En vivo</span>
      </div>
      <div className="flex w-max py-4 animate-marquee hover:[animation-play-state:paused]">
        {row(false)}
        {row(true)}
        {row(true)}
        {row(true)}
      </div>
    </section>
  );
}

// ============================================================================
//  Vista previa del mercado (anuncios reales)
// ============================================================================

const RANK_EMOJI: Record<string, string> = { HIERRO: "🪨", BRONCE: "🥉", PLATA: "🥈", ORO: "🥇", DIAMANTE: "💎" };

export function MarketPreview() {
  const { data, loading } = useLanding();
  const signedIn = useSignedIn();
  const ads = data?.market.sellPreview ?? [];

  return (
    <section id="mercado" className="py-20 md:py-28 scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Mercado en vivo"
          title={<>Los mejores precios, <span className="text-brand-gradient">ahora mismo</span></>}
          subtitle="Anuncios reales de comerciantes verificados. Elige, paga desde tu banco y recibe tus USDT."
        />

        <motion.div {...reveal} className="rounded-[2rem] bg-white/80 dark:bg-zinc-900/60 backdrop-blur border border-zinc-200/80 dark:border-white/10 shadow-xl shadow-zinc-900/5 overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.6fr_1fr_1.3fr_1.2fr_auto] gap-4 px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-100 dark:border-white/5">
            <span>Anunciante</span>
            <span>Precio</span>
            <span>Disponible / Límites</span>
            <span>Métodos</span>
            <span className="w-28" />
          </div>

          {loading && !data ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="px-6 py-5 border-b border-zinc-100 dark:border-white/5 last:border-0 flex items-center gap-4 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
                <div className="h-9 w-28 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
              </div>
            ))
          ) : ads.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Store className="w-7 h-7" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">Aún no hay anuncios de venta publicados</h3>
              <p className="mt-1 text-zinc-500">Sé el primer comerciante del mercado y fija tu precio.</p>
              <Link href={signedIn ? "/dashboard/p2p/post-ad" : REGISTER_URL} className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold">
                {signedIn ? "Publicar un anuncio" : "Crear cuenta para publicar"} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            ads.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="group grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1.3fr_1.2fr_auto] gap-4 items-center px-6 py-5 border-b border-zinc-100 dark:border-white/5 last:border-0 hover:bg-emerald-500/[0.03] transition-colors"
              >
                <div className="col-span-2 md:col-span-1 flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-brand-gold via-brand-red to-brand-blue p-[2px]">
                    <div className="w-full h-full rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center font-bold text-zinc-800 dark:text-zinc-100">
                      {a.merchant.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-white truncate">
                      {a.merchant}
                      {a.verified && <BadgeCheck className="w-4 h-4 text-brand-gold shrink-0" />}
                      <span title={a.rank} className="text-sm">{RANK_EMOJI[a.rank] ?? ""}</span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      {a.trades} órdenes · {a.trades > 0 && a.completionRate != null ? `${a.completionRate.toFixed(1)}% completadas` : "nuevo"}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xl font-black text-zinc-900 dark:text-white tabular-nums">{fmtBs(a.price)}</div>
                  <div className="text-xs text-zinc-500">Bs / USDT</div>
                </div>
                <div className="text-sm">
                  <div className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{fmtBs(a.available)} USDT</div>
                  <div className="text-xs text-zinc-500 tabular-nums">{fmtBs(a.min, 0)} – {fmtBs(a.max, 0)} Bs</div>
                </div>
                <div className="hidden md:flex flex-wrap gap-1.5">
                  {a.methods.split(",").map((m) => m.trim()).filter(Boolean).slice(0, 2).map((m) => (
                    <span key={m} className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 border border-zinc-200/70 dark:border-white/10">
                      {m}
                    </span>
                  ))}
                </div>
                <Link
                  href={signedIn ? "/dashboard/p2p" : REGISTER_URL}
                  className="col-span-2 md:col-span-1 md:w-28 text-center px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-bold shadow-md shadow-emerald-500/20 transition-all group-hover:-translate-y-0.5"
                >
                  Comprar
                </Link>
              </motion.div>
            ))
          )}

          {ads.length > 0 && (
            <div className="px-6 py-4 bg-zinc-50/80 dark:bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
              <span className="text-zinc-500">
                {data?.market.activeAds ?? 0} anuncios activos · actualizado cada minuto
              </span>
              <Link href={signedIn ? "/dashboard/p2p" : REGISTER_URL} className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400 hover:gap-2.5 transition-all">
                {signedIn ? "Ver todo el mercado" : "Regístrate para operar"} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

// ============================================================================
//  Cómo funciona
// ============================================================================

const STEPS = [
  { icon: UserPlus, title: "Crea tu cuenta y verifícate", text: "Regístrate con tu cédula y completa el KYC en menos de 2 minutos: foto del documento y una selfie.", color: "from-brand-gold to-amber-500" },
  { icon: Store, title: "Elige un anuncio", text: "Compara precio, límites y reputación. Al abrir la orden, los USDT del vendedor quedan bloqueados en Escrow.", color: "from-brand-red to-pink-500" },
  { icon: Wallet, title: "Paga y recibe", text: "Paga por Pago Móvil o transferencia a la cuenta del vendedor. Cuando confirma, los USDT llegan a tu billetera.", color: "from-brand-blue to-cyan-500" },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-20 md:py-28 relative scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Cómo funciona" title={<>Tres pasos. <span className="text-brand-gradient">Cero sustos.</span></>} />
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6">
          <div aria-hidden className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-brand-gold via-brand-red to-brand-blue opacity-40" />
          {STEPS.map((s, i) => (
            <motion.div key={s.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.12 }} className="relative text-center px-4">
              <div className="relative mx-auto w-24 h-24">
                <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${s.color} opacity-20 blur-xl`} />
                <div className={`relative w-24 h-24 rounded-3xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow-xl rotate-3 hover:rotate-0 transition-transform`}>
                  <s.icon className="w-10 h-10 text-white" />
                </div>
                <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-black flex items-center justify-center ring-4 ring-zinc-50 dark:ring-zinc-950">
                  {i + 1}
                </span>
              </div>
              <h3 className="mt-6 text-xl font-bold text-zinc-900 dark:text-white">{s.title}</h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400 leading-relaxed">{s.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
//  Seguridad (todo lo que aparece aquí está implementado)
// ============================================================================

const FEATURES = [
  { icon: Lock, title: "Escrow en cada orden", text: "Los USDT se bloquean al abrir la orden y solo se liberan cuando el vendedor confirma el pago. Nadie se queda con tu dinero.", span: "md:col-span-2", glow: "bg-emerald-500" },
  { icon: ScanLine, title: "Una cédula, una cuenta", text: "Leemos automáticamente el número de tu documento. Si ya existe en otra cuenta, se rechaza.", span: "", glow: "bg-brand-gold" },
  { icon: Landmark, title: "Cuentas a tu nombre", text: "Solo puedes cobrar en cuentas con la misma cédula de tu KYC. Adiós a los terceros.", span: "", glow: "bg-brand-blue" },
  { icon: Gavel, title: "Mediación con doble control", text: "Si algo sale mal, apelas. Un agente revisa las pruebas y un administrador aprueba el veredicto.", span: "", glow: "bg-brand-red" },
  { icon: KeyRound, title: "2FA y lista blanca", text: "Protege la liberación de fondos y tus retiros con autenticación de dos factores y direcciones de confianza.", span: "", glow: "bg-violet-500" },
  { icon: Bell, title: "Todo en tiempo real", text: "Chat, pagos y liberaciones al instante, con sonido y notificaciones aunque estés en otra pestaña.", span: "md:col-span-2", glow: "bg-cyan-500" },
];

export function SecurityBento() {
  return (
    <section id="seguridad" className="py-20 md:py-28 scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Seguridad"
          title={<>Diseñado para que <span className="text-brand-gradient">confíes</span></>}
          subtitle="Las mismas protecciones de los grandes exchanges, pensadas para cómo se paga en Venezuela."
        />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              {...reveal}
              transition={{ ...reveal.transition, delay: (i % 3) * 0.08 }}
              className={`group relative overflow-hidden rounded-[1.75rem] p-7 bg-white/80 dark:bg-zinc-900/60 backdrop-blur border border-zinc-200/80 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 hover:-translate-y-1 hover:shadow-2xl hover:shadow-zinc-900/10 transition-all duration-300 ${f.span}`}
            >
              <div className={`absolute -top-16 -right-16 w-40 h-40 rounded-full ${f.glow} opacity-10 blur-3xl group-hover:opacity-25 transition-opacity`} />
              <div className="relative w-12 h-12 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="relative mt-5 text-lg font-bold text-zinc-900 dark:text-white">{f.title}</h3>
              <p className="relative mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
//  Cifras (solo reales; si son 0 no se muestran)
// ============================================================================

export function StatsBand() {
  const { data } = useLanding();
  if (!data) return null;
  const stats = [
    { icon: Fingerprint, label: "Usuarios verificados", value: data.stats.verifiedUsers, decimals: 0 },
    { icon: Zap, label: "Órdenes completadas", value: data.stats.completedTrades, decimals: 0 },
    { icon: TrendingUp, label: "Volumen 24 h (USDT)", value: data.stats.volume24h, decimals: 2 },
    { icon: Store, label: "Anuncios activos", value: data.market.activeAds, decimals: 0 },
  ].filter((s) => s.value > 0);
  if (stats.length === 0) return null;

  return (
    <section className="py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          {...reveal}
          className={`grid grid-cols-2 ${stats.length >= 4 ? "md:grid-cols-4" : stats.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"} gap-px rounded-[2rem] overflow-hidden bg-zinc-200/80 dark:bg-white/10 border border-zinc-200/80 dark:border-white/10`}
        >
          {stats.map((s) => (
            <div key={s.label} className="bg-white dark:bg-zinc-950 p-7 text-center">
              <s.icon className="w-5 h-5 mx-auto text-emerald-500" />
              <CountUp value={s.value} decimals={s.decimals} className="block mt-3 text-3xl md:text-4xl font-black tracking-tight text-zinc-900 dark:text-white tabular-nums" />
              <div className="mt-1 text-sm text-zinc-500">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ============================================================================
//  Preguntas frecuentes
// ============================================================================

const FAQS = [
  { q: "¿Qué es el Escrow y cómo me protege?", a: "Cuando abres una orden, los USDT del vendedor quedan bloqueados por Roraima. El vendedor no puede retirarlos ni venderlos a otra persona. Solo se liberan a tu billetera cuando confirma que recibió tu pago; si hay un problema, quedan congelados hasta que un mediador resuelva." },
  { q: "¿Cuánto cuesta operar?", a: "Si tomas un anuncio (compras o vendes en el mercado) pagas 0% de comisión. Quien publica el anuncio paga 0,1%. Los retiros de USDT a otra billetera tienen una comisión fija de red que verás antes de confirmar." },
  { q: "¿Qué métodos de pago puedo usar?", a: "Pago Móvil y transferencia bancaria. Las cuentas para cobrar deben estar a tu nombre, con la misma cédula de tu verificación KYC. Paga siempre desde una cuenta propia." },
  { q: "¿Por qué tengo que verificar mi identidad?", a: "Para que cada persona tenga una sola cuenta y nadie opere con datos de otro. Puedes usar tu cédula, pasaporte o licencia de conducir: los tres llevan el mismo número de cédula, que debe coincidir con tu perfil." },
  { q: "¿Cuánto tiempo tengo para pagar?", a: "15 minutos desde que abres la orden. Si no pagas a tiempo, la orden se cancela sola y los USDT vuelven al vendedor." },
  { q: "¿Qué pasa si el vendedor no libera mis USDT?", a: "Después de marcar el pago puedes apelar (10 minutos para Pago Móvil, 30 para transferencias). Un agente de soporte revisa los comprobantes del chat y un administrador emite el veredicto. Los fondos siguen protegidos mientras tanto." },
];

export function Faq() {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <section id="preguntas" className="py-20 md:py-28 scroll-mt-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Preguntas frecuentes" title="Todo lo que necesitas saber" />
        <div className="space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <motion.div key={f.q} {...reveal} transition={{ ...reveal.transition, delay: i * 0.05 }} className={`rounded-2xl border transition-colors ${isOpen ? "bg-white dark:bg-zinc-900 border-emerald-500/30 shadow-lg shadow-emerald-500/5" : "bg-white/60 dark:bg-zinc-900/40 border-zinc-200/80 dark:border-white/10"}`}>
                <button
                  id={`faq-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-4 text-left px-6 py-5"
                >
                  <span className="font-bold text-zinc-900 dark:text-white">{f.q}</span>
                  <ChevronDown className={`w-5 h-5 shrink-0 text-zinc-400 transition-transform duration-300 ${isOpen ? "rotate-180 text-emerald-500" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                      <p className="px-6 pb-6 -mt-1 text-zinc-600 dark:text-zinc-400 leading-relaxed">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
//  Llamado final
// ============================================================================

export function FinalCta() {
  return (
    <section className="pb-24 md:pb-32 pt-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...reveal} className="relative overflow-hidden rounded-[2.5rem] bg-zinc-950 text-white px-6 py-16 md:px-16 md:py-20">
          <div aria-hidden className="absolute inset-0">
            <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-gold/30 blur-[100px] animate-aurora" />
            <div className="absolute -bottom-32 left-1/3 w-96 h-96 rounded-full bg-brand-red/25 blur-[100px] animate-aurora [animation-delay:-5s]" />
            <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-brand-blue/30 blur-[100px] animate-aurora [animation-delay:-10s]" />
            <div className="absolute inset-0 bg-grid opacity-40" />
          </div>
          <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 items-center">
            <div className="text-center md:text-left">
              <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                Tu próximo USDT, <span className="text-brand-gradient">en minutos.</span>
              </h2>
              <p className="mt-4 text-lg text-white/70 max-w-xl">
                Crea tu cuenta gratis, verifica tu identidad y opera con la tranquilidad del Escrow.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <Link href={REGISTER_URL} id="cta-register" className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-white text-zinc-950 font-bold text-lg hover:-translate-y-0.5 transition-transform shadow-xl">
                  Crear cuenta gratis <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link href="/auth" id="cta-login" className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl border border-white/20 text-white font-bold text-lg hover:bg-white/10 transition-colors">
                  <LogIn className="w-5 h-5" /> Ya tengo cuenta
                </Link>
              </div>
            </div>
            <div className="relative hidden md:block">
              <img src="/emblem.webp" alt="" className="w-56 h-56 object-contain animate-float drop-shadow-[0_30px_60px_rgba(245,184,46,0.35)]" />
              <div className="absolute -bottom-4 -left-10 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 backdrop-blur border border-white/15 text-sm font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Protegido por Escrow
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
