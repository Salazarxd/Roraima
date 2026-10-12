import * as React from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

const COLUMNS = [
  {
    title: "Conoce Roraima",
    links: [
      { href: "/#mercado", label: "Mercado en vivo" },
      { href: "/#como-funciona", label: "Cómo funciona" },
      { href: "/#seguridad", label: "Seguridad y Escrow" },
      { href: "/#preguntas", label: "Preguntas frecuentes" },
    ],
  },
  {
    title: "Empieza",
    links: [
      { href: "/auth?modo=registro", label: "Crear cuenta gratis" },
      { href: "/auth", label: "Iniciar sesión" },
    ],
  },
  {
    title: "Legal y ayuda",
    links: [
      { href: "/terminos", label: "Términos de servicio" },
      { href: "/privacidad", label: "Política de privacidad" },
      { href: "/contacto", label: "Contacto y soporte" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-zinc-950 backdrop-blur">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-gold/60 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5">
              <img src="/emblem.webp" alt="" className="w-10 h-10 object-contain" />
              <span className="leading-none">
                <span className="block font-black tracking-tight text-lg text-zinc-900 dark:text-white">RORAIMA</span>
                <span className="block text-[10px] font-bold tracking-[0.2em] text-emerald-600 dark:text-emerald-400">P2P EXCHANGE</span>
              </span>
            </Link>
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 max-w-xs leading-relaxed">
              El mercado P2P de USDT hecho para Venezuela. Escrow en cada orden, identidad verificada y soporte humano.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
              <ShieldCheck className="w-4 h-4" /> Fondos protegidos por Escrow
            </div>
          </div>

          {COLUMNS.map((c) => (
            <div key={c.title}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">{c.title}</h3>
              <ul className="mt-4 space-y-3">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-zinc-200/80 dark:border-white/10 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <p>&copy; 2026 Roraima Capital&apos;s Exchange. Todos los derechos reservados.</p>
          <p>Operar con criptoactivos conlleva riesgos. Opera solo con cuentas a tu nombre.</p>
        </div>
      </div>
    </footer>
  );
}
