"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShieldCheck, 
  Download, 
  ArrowUpRight, 
  Eye, 
  EyeOff, 
  User, 
  TrendingUp, 
  Sparkles,
  HelpCircle,
  Bell
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { waitForUser } from "@/lib/client-auth";
import { PriceAlertsModal } from "@/components/price-alerts-modal";

type Rates = {
  binance: number | null;
  bcv: number | null;
  parallel: number | null;
  roraima: number | null;
};

export function DashboardHeader() {
  const router = useRouter();
  const [rates, setRates] = React.useState<Rates | null>(null);
  const [kycVerified, setKycVerified] = React.useState(false);
  const [userEmail, setUserEmail] = React.useState<string | null>(null);
  const [balance, setBalance] = React.useState<number | null>(null);
  const [hideBalance, setHideBalance] = React.useState(false);
  const [showAlertModal, setShowAlertModal] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      const u = await waitForUser();
      if (!u || cancelled) return;
      setUserEmail(u.email ?? "Usuario");

      try {
        const token = await u.getIdToken();
        const [{ getMyProfile }, { getWalletOverview }] = await Promise.all([
          import("@/app/actions/account"),
          import("@/app/actions/funds"),
        ]);

        const [profRes, walletRes] = await Promise.all([
          getMyProfile(token),
          getWalletOverview(token),
        ]);

        if (!cancelled) {
          if (profRes.success && profRes.profile.kycStatus === "VERIFIED") {
            setKycVerified(true);
          }
          if (walletRes.success) {
            setBalance(walletRes.available);
          }
        }
      } catch {
        // Silencioso si no hay conexión temporal
      }
    };

    loadData();

    import("@/app/actions/exchange-rate")
      .then(({ getReferenceRates }) => getReferenceRates())
      .then((r) => {
        if (!cancelled) setRates(r);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const marketRate = rates?.roraima ?? rates?.binance ?? rates?.parallel ?? null;

  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 dark:bg-zinc-950/90 backdrop-blur-2xl border-b border-zinc-200/70 dark:border-zinc-800/70 pt-[env(safe-area-inset-top)] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
        
        {/* Left: Brand & Prominent Logo */}
        <Link 
          href="/dashboard" 
          className="flex items-center gap-3 group shrink-0 transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {/* Logo Icon Container with Glow */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/30 to-amber-500/20 rounded-2xl blur-md group-hover:blur-lg transition-all opacity-80" />
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white dark:bg-zinc-900 border border-emerald-500/30 dark:border-emerald-500/20 p-1.5 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <img 
                src="/logo-transparent.png" 
                alt="Roraima Exchange" 
                className="w-full h-full object-contain filter drop-shadow-sm" 
              />
            </div>
          </div>

          {/* Brand Text Typography */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-lg sm:text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-50 font-sans">
                RORAIMA
              </span>
              <span className="hidden sm:inline-flex items-center text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/20">
                P2P
              </span>
            </div>
            <span className="text-[10px] sm:text-[11px] font-extrabold tracking-wider text-emerald-600 dark:text-emerald-400 uppercase leading-none">
              Exchange Venezuela
            </span>
          </div>
        </Link>

        {/* Center: Live Rates Banner (Hidden on extra small, shown on sm+) */}
        {rates && (
          <div className="hidden md:flex items-center gap-2 lg:gap-3 px-3 py-1.5 rounded-2xl bg-zinc-100/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-zinc-800 dark:text-zinc-200">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-zinc-400 font-normal">Tasa P2P:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-black font-mono">
                {marketRate ? `${marketRate.toFixed(2)} Bs` : "—"}
              </span>
            </div>
            {rates.bcv && (
              <>
                <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <div className="flex items-center gap-1 font-medium text-zinc-600 dark:text-zinc-400">
                  <span className="text-zinc-400 text-[11px]">BCV:</span>
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">{rates.bcv.toFixed(2)} Bs</span>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowAlertModal(true)}
              className="p-1 rounded-lg hover:bg-amber-500/10 text-amber-500 transition-colors ml-0.5"
              title="Configurar alerta de precio"
            >
              <Bell className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Right: Quick Balance, KYC & Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Quick Balance Pill (Desktop/Tablet) */}
          {balance != null && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
              <span className="text-zinc-400 text-[11px] font-medium">Disponible:</span>
              <span className="font-black font-mono text-emerald-600 dark:text-emerald-400">
                {hideBalance ? "••••" : `$${balance.toFixed(2)} USDT`}
              </span>
              <button 
                type="button"
                onClick={() => setHideBalance(!hideBalance)} 
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-0.5"
                title={hideBalance ? "Mostrar saldo" : "Ocultar saldo"}
              >
                {hideBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          {/* KYC Status Badge */}
          {kycVerified ? (
            <div 
              className="hidden xs:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold"
              title="Identidad Verificada con KYC"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">Verificado</span>
            </div>
          ) : (
            <Link
              href="/dashboard/security"
              className="hidden xs:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/25 transition-colors"
            >
              <span>Verificar KYC</span>
            </Link>
          )}

          {/* Quick P2P Trade / Deposit Button */}
          <Link
            href="/dashboard/p2p"
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all hover:scale-105 active:scale-95"
          >
            <span>Operar P2P</span>
            <ArrowUpRight className="w-3.5 h-3.5 hidden sm:inline" />
          </Link>

          {/* Avatar Profile Link */}
          <Link
            href="/dashboard/settings"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all font-bold text-sm shadow-sm"
            title="Ajustes y Cuenta"
          >
            {userEmail ? (
              userEmail.charAt(0).toUpperCase()
            ) : (
              <User className="w-4 h-4" />
            )}
          </Link>
        </div>
      </div>

      <PriceAlertsModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        currentRate={marketRate}
      />
    </header>
  );
}
