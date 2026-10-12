"use client";

import * as React from "react";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { Menu, X, ArrowRight, LayoutDashboard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "@/lib/firebase";
import { useSystemSettings } from "./settings-provider";

// Enlaces INFORMATIVOS (secciones de la portada). El panel solo se abre desde "Mi panel" con sesión.
const LINKS = [
  { href: "/#mercado", label: "Mercado" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#seguridad", label: "Seguridad" },
  { href: "/#preguntas", label: "Preguntas" },
  { href: "/contacto", label: "Soporte" },
];

export function Navbar() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [signedIn, setSignedIn] = React.useState(false);
  const [pathname, setPathname] = React.useState("");
  const [section, setSection] = React.useState("");
  const settings = useSystemSettings();

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    setPathname(window.location.pathname);
    window.addEventListener("scroll", onScroll, { passive: true });
    const unsub = auth.onAuthStateChanged((u) => setSignedIn(!!u));

    // Scrollspy: resalta la sección de la portada visible en pantalla
    let io: IntersectionObserver | undefined;
    if (window.location.pathname === "/") {
      const ids = LINKS.filter((l) => l.href.startsWith("/#")).map((l) => l.href.slice(2));
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) setSection(e.target.id);
          });
        },
        { rootMargin: "-45% 0px -50% 0px" }
      );
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) io!.observe(el);
      });
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      unsub();
      io?.disconnect();
    };
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || isOpen
          ? "bg-white/75 dark:bg-zinc-950/75 backdrop-blur-xl border-b border-zinc-200/70 dark:border-white/10 shadow-sm shadow-black/[0.03]"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex items-center justify-between transition-all duration-300 ${scrolled ? "h-16" : "h-16 md:h-20"}`}>
          {/* Logo */}
          <Link href="/" id="nav-logo" className="flex items-center gap-2.5 group" aria-label="Roraima Exchange, inicio">
            <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-500/20 p-1 flex items-center justify-center shadow-md shadow-emerald-500/10 transition-transform group-hover:scale-105">
              <img src="/logo-transparent.png" alt="Roraima" className="w-full h-full object-contain" />
            </div>
            <span className="leading-none">
              <span className="block font-black tracking-tight text-lg text-zinc-900 dark:text-white">RORAIMA</span>
              <span className="block text-[10px] font-bold tracking-[0.2em] text-emerald-600 dark:text-emerald-400">P2P EXCHANGE</span>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1 rounded-full p-1 bg-zinc-100/70 dark:bg-white/5 border border-zinc-200/60 dark:border-white/10">
            {LINKS.map((l) => {
              const active = l.href.startsWith("/#") ? pathname === "/" && section === l.href.slice(2) : pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    active ? "text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-white dark:bg-white/10 shadow-sm -z-10" />}
                  {l.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            {signedIn ? (
              <Link
                href="/dashboard"
                id="nav-dashboard"
                className="group inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:shadow-lg hover:shadow-emerald-500/20 transition-all"
              >
                <LayoutDashboard className="w-4 h-4" /> Mi panel
              </Link>
            ) : (
              <>
                <Link href="/auth" id="nav-login" className="text-sm font-semibold px-4 py-2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors">
                  Iniciar sesión
                </Link>
                <Link
                  href="/auth?modo=registro"
                  id="nav-register"
                  className="group inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/25 transition-all hover:-translate-y-0.5"
                >
                  Registrarse <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile */}
          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <button
              id="nav-mobile-toggle"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={isOpen}
              className="p-2 rounded-xl text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden border-t border-zinc-200/70 dark:border-white/10"
          >
            <div className="px-4 pt-3 pb-6 space-y-1" onClick={(e) => (e.target as HTMLElement).closest("a") && setIsOpen(false)}>
              {LINKS.map((l, i) => (
                <motion.div key={l.href} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                  <Link href={l.href} className="flex items-center justify-between px-4 py-3 rounded-2xl text-base font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5">
                    {l.label} <ArrowRight className="w-4 h-4 text-zinc-400" />
                  </Link>
                </motion.div>
              ))}
              <div className="pt-4 grid grid-cols-2 gap-3">
                {signedIn ? (
                  <Link href="/dashboard" className="col-span-2 text-center px-4 py-3.5 rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold">
                    Ir a mi panel
                  </Link>
                ) : (
                  <>
                    <Link href="/auth" className="text-center px-4 py-3.5 rounded-2xl border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 font-semibold">
                      Iniciar sesión
                    </Link>
                    <Link href="/auth?modo=registro" className="text-center px-4 py-3.5 rounded-2xl bg-emerald-500 text-zinc-950 font-semibold shadow-lg shadow-emerald-500/25">
                      Registrarse
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
