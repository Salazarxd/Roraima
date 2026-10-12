"use client";

import * as React from "react";
import { motion, Variants } from "framer-motion";
import { 
  Download, 
  Upload, 
  Send,
  Lock,
  Megaphone,
  ShieldCheck,
  Clock,
} from "lucide-react";

import { auth } from "@/lib/firebase";
import { ActivityList, FundsModal, type FundsMode, type LedgerRow } from "@/components/funds-modals";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

type Overview = {
  available: number;
  usdtBalance?: number;
  usdcBalance?: number;
  locked: { ads: number; escrow: number; withdrawals: number; total: number };
  total: number;
};

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WalletsPage() {
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [history, setHistory] = React.useState<LedgerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState<FundsMode | null>(null);
  const [selectedCurrency, setSelectedCurrency] = React.useState<"USDT" | "USDC">("USDT");

  const load = React.useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const { getWalletOverview, getWalletHistory } = await import("@/app/actions/funds");
    const [ov, hist] = await Promise.all([getWalletOverview(token), getWalletHistory(token, 100)]);
    if (ov.success) setOverview(ov);
    if (hist.success) setHistory(hist.rows);
  }, []);

  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) await load();
      setLoading(false);
    });
    return () => unsubscribe();
  }, [load]);

  const totalBalance = overview?.total ?? 0;
  const usdtBalance = overview?.usdtBalance ?? overview?.available ?? 0;
  const usdcBalance = overview?.usdcBalance ?? 0;
  const locked = overview?.locked ?? { ads: 0, escrow: 0, withdrawals: 0, total: 0 };

  const openDeposit = (curr: "USDT" | "USDC") => {
    setSelectedCurrency(curr);
    setMode("deposit");
  };

  const openWithdraw = (curr: "USDT" | "USDC") => {
    setSelectedCurrency(curr);
    setMode("withdraw");
  };

  return (
    <motion.div 
      variants={containerVariants} 
      initial="hidden" 
      animate="show"
      className="space-y-8"
    >
      <motion.div variants={itemVariants} className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Mis Billeteras</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Gestiona tus criptoactivos en red TRON (TRC20)</p>
        </div>
      </motion.div>

      {/* Total Balance Header */}
      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-8 shadow-sm border border-zinc-100 dark:border-zinc-800/60 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <span className="text-zinc-500 dark:text-zinc-400 font-medium">Balance Total Estimado (USD)</span>
          <div className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-50 mt-1">
            <span className="text-zinc-400 font-normal mr-1">$</span>
            {loading ? "..." : money(totalBalance)}
          </div>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button id="wallet-deposit-btn" onClick={() => openDeposit("USDT")} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-400 dark:hover:bg-emerald-500 text-white dark:text-zinc-950 font-bold transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-emerald-600/20">
            <Download className="w-5 h-5" />
            Depositar
          </button>
          <button id="wallet-withdraw-btn" onClick={() => openWithdraw("USDT")} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 font-bold transition-transform hover:scale-105 active:scale-95">
            <Upload className="w-5 h-5" />
            Retirar
          </button>
        </div>
      </motion.div>

      {/* Individual Wallets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* USDT Wallet Card */}
        <motion.div variants={itemVariants} className="relative bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 shadow-sm border border-zinc-100 dark:border-zinc-800/60 overflow-hidden group">
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-400/10 dark:bg-emerald-400/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 transition-transform group-hover:scale-150" />
          
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <span className="text-white font-bold text-xl">₮</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">Tether US</h3>
                  <span className="text-sm text-zinc-500">USDT · TRC20</span>
                </div>
              </div>
            </div>

            <div className="space-y-1 mb-8">
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Disponible</span>
              <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                {loading ? "..." : money(usdtBalance)}
              </div>
              <div className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                En órdenes: {money(locked.total)} USDT
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => openDeposit("USDT")} className="flex-1 py-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium transition-colors text-sm">
                Depositar
              </button>
              <button onClick={() => openWithdraw("USDT")} className="flex-1 py-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium transition-colors text-sm">
                Retirar
              </button>
              <button id="wallet-transfer-btn" onClick={() => setMode("transfer")} className="flex-1 py-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium transition-colors text-sm flex items-center justify-center gap-1">
                <Send className="w-4 h-4" /> Transferir
              </button>
            </div>
          </div>
        </motion.div>

        {/* USDC Wallet Card */}
        <motion.div variants={itemVariants} className="relative bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 shadow-sm border border-zinc-100 dark:border-zinc-800/60 overflow-hidden group">
          <div className="absolute top-0 right-0 w-40 h-40 bg-blue-400/10 dark:bg-blue-400/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 transition-transform group-hover:scale-150" />
          
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <span className="text-white font-bold text-xl">Ⓢ</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">USD Coin</h3>
                  <span className="text-sm text-zinc-500">USDC · TRC20</span>
                </div>
              </div>
            </div>

            <div className="space-y-1 mb-8">
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Disponible</span>
              <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                {loading ? "..." : money(usdcBalance)}
              </div>
              <div className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                Estable 1:1 USD
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => openDeposit("USDC")} className="flex-1 py-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium transition-colors text-sm">
                Depositar
              </button>
              <button onClick={() => openWithdraw("USDC")} className="flex-1 py-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium transition-colors text-sm">
                Retirar
              </button>
            </div>
          </div>
        </motion.div>

        {/* Locked funds breakdown */}
        <motion.div variants={itemVariants} className="relative bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 shadow-sm border border-zinc-100 dark:border-zinc-800/60 overflow-hidden group">
          <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-400/10 dark:bg-indigo-400/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 transition-transform group-hover:scale-150" />
          
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                  <Lock className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">Fondos bloqueados</h3>
                  <span className="text-sm text-zinc-500">Protegidos por Roraima</span>
                </div>
              </div>
            </div>

            <div className="space-y-1 mb-6">
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total bloqueado</span>
              <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                {loading ? "..." : money(locked.total)}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {[
                { icon: Megaphone, label: "En anuncios de venta", value: locked.ads },
                { icon: ShieldCheck, label: "En escrow de órdenes P2P", value: locked.escrow },
                { icon: Clock, label: "Retiros en proceso", value: locked.withdrawals },
              ].map((r) => (
                <div key={r.label} className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/50">
                  <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400"><r.icon className="w-4 h-4" /> {r.label}</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">{money(r.value)} USDT</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

      </div>

      {/* Full history */}
      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-4">Historial de movimientos</h3>
        <ActivityList rows={history} />
      </motion.div>

      <FundsModal
        mode={mode}
        onClose={() => setMode(null)}
        available={selectedCurrency === "USDC" ? usdcBalance : usdtBalance}
        initialCurrency={selectedCurrency}
        onChanged={load}
      />
    </motion.div>
  );
}
