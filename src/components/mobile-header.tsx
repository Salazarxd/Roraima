"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ShieldCheck, User } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { auth } from "@/lib/firebase";

export function MobileHeader() {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = React.useState<string | null>(null);
  const [kycVerified, setKycVerified] = React.useState(false);
  const [rate, setRate] = React.useState<number | null>(null);

  React.useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        setUserEmail(null);
        setKycVerified(false);
        return;
      }
      setUserEmail(u.email);
      try {
        const { getMyProfile } = await import("@/app/actions/account");
        const res = await getMyProfile(await u.getIdToken());
        if (res.success && res.profile.kycStatus === "VERIFIED") {
          setKycVerified(true);
        }
      } catch {
        // Ignorar si falla la carga silenciosa
      }
    });

    import("@/app/actions/exchange-rate")
      .then(({ getReferenceRates }) => getReferenceRates())
      .then((r) => setRate(r.roraima ?? r.binance ?? r.parallel ?? null))
      .catch(() => {});

    return () => unsub();
  }, []);

  if (!pathname?.startsWith("/dashboard")) return null;

  return (
    <header className="md:hidden sticky top-0 z-40 w-full bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-200/60 dark:border-zinc-800/60 pt-[env(safe-area-inset-top)] transition-colors">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Logo & Brand */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl overflow-hidden bg-zinc-950/5 dark:bg-zinc-900 border border-emerald-500/20 p-1 flex items-center justify-center shadow-sm">
            <img
              src="/logo-transparent.png"
              alt="Roraima"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="font-extrabold text-base tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-1.5">
            Roraima
            {kycVerified && (
              <span title="Usuario Verificado" className="text-emerald-500">
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>
            )}
          </span>
        </Link>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {rate && (
            <div className="hidden xs:flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="text-zinc-400 font-normal">Tasa:</span>
              <span>{rate.toFixed(2)} Bs</span>
            </div>
          )}

          <Link
            href="/dashboard/notifications"
            className="p-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors relative"
            aria-label="Notificaciones"
          >
            <Bell className="w-4 h-4" />
          </Link>

          <div className="scale-90">
            <ThemeToggle />
          </div>

          <Link
            href="/dashboard/settings"
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-emerald-500/40 transition-colors ml-0.5"
            aria-label="Perfil y Ajustes"
          >
            {userEmail ? (
              <span className="text-xs font-bold uppercase">
                {userEmail.charAt(0)}
              </span>
            ) : (
              <User className="w-4 h-4" />
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
