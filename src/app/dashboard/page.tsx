"use client";

import * as React from "react";
import { motion, Variants } from "framer-motion";
import { 
  Download, 
  Upload, 
  Send, 
  ArrowLeftRight,
  Eye,
  EyeOff,
  BarChart3,
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  Unlock
} from "lucide-react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { FundsModal, type FundsMode, type LedgerRow, LEDGER_LABELS } from "@/components/funds-modals";
import { CryptoCalculatorWidget } from "@/components/crypto-calculator-widget";

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

type Overview = { available: number; locked: { ads: number; escrow: number; withdrawals: number; total: number }; total: number; recent: LedgerRow[] };
type Rates = { binance: number | null; bcv: number | null; parallel: number | null; roraima: number | null };

export default function DashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [rates, setRates] = React.useState<Rates | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState<FundsMode | null>(null);
  const [hideBalance, setHideBalance] = React.useState(false);

  const load = React.useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    const { getWalletOverview } = await import("@/app/actions/funds");
    const res = await getWalletOverview(await user.getIdToken());
    if (res.success) setOverview(res);
  }, []);

  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) await load();
      setLoading(false);
    });
    import("@/app/actions/exchange-rate").then(({ getReferenceRates }) => getReferenceRates().then(setRates));
    return () => unsubscribe();
  }, [load]);

  const totalBalance = overview?.total ?? 0;
  const usdtBalance = overview?.available ?? 0;
  const lockedBalance = overview?.locked.total ?? 0;
  const marketRate = rates?.roraima ?? rates?.binance ?? rates?.parallel ?? null;
  const bssEstimated = marketRate ? totalBalance * marketRate : null;
  const bcvEstimated = rates?.bcv ? totalBalance * rates.bcv : null;

  return (
    <motion.div 
      variants={containerVariants} 
      initial="hidden" 
      animate="show"
      className="space-y-8"
    >
      <motion.div variants={itemVariants} className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Mi Billetera</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Resumen general de tu cuenta</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Wallet Card & Quick Actions */}
        <div className="lg:col-span-1 space-y-6">
          {/* Apple Card Style Wallet Card */}
          <motion.div 
            variants={itemVariants}
            className="relative w-full aspect-[1.586/1] rounded-[2rem] p-6 text-white overflow-hidden shadow-xl shadow-emerald-900/20"
            style={{
              background: "linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)",
            }}
          >
            {/* Glossy overlay effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-50 pointer-events-none" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2" />
            
            <div className="relative h-full flex flex-col justify-between z-10">
              <div className="flex justify-between items-start">
                <span className="font-medium text-emerald-50">Saldo Total Estimado</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setHideBalance(!hideBalance)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-emerald-100 hover:text-white">
                    {hideBalance ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                  <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                    <span className="font-bold text-sm">R</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-4">
                <div className="text-4xl sm:text-5xl font-extrabold tracking-tight flex items-center">
                  <span className="text-emerald-200 text-3xl mr-1">$</span>
                  {loading ? "..." : hideBalance ? "••••" : totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="mt-2 text-sm text-emerald-100 flex flex-col gap-0.5">
                  <span>≈ {loading || bssEstimated == null ? "—" : hideBalance ? "•••• VES" : bssEstimated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " VES"} <span className="text-emerald-200/80 text-xs">(mercado{marketRate ? ` ${marketRate.toFixed(2)}` : ""})</span></span>
                  {bcvEstimated != null && (
                    <span className="text-xs text-emerald-100/80">≈ {hideBalance ? "••••" : bcvEstimated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES a tasa BCV {rates?.bcv?.toFixed(2)}</span>
                  )}
                </div>
              </div>
              
              {/* Sparkline Chart */}
              <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none overflow-hidden rounded-b-[2rem]">
                <svg className="w-full h-full opacity-60 translate-y-2" viewBox="0 0 100 30" preserveAspectRatio="none">
                  <path d="M0,30 L0,20 C10,15 20,25 30,10 C40,-5 50,20 60,15 C70,10 80,5 100,0 L100,30 Z" fill="url(#gradient)" />
                  <path d="M0,20 C10,15 20,25 30,10 C40,-5 50,20 60,15 C70,10 80,5 100,0" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1" strokeLinecap="round" />
                  <defs>
                    <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div variants={itemVariants} className="grid grid-cols-4 gap-3">
            {[
              { icon: Download, label: "Depositar", onClick: () => setMode("deposit") },
              { icon: Upload, label: "Retirar", onClick: () => setMode("withdraw") },
              { icon: Send, label: "Transferir", onClick: () => setMode("transfer") },
              { icon: ArrowLeftRight, label: "P2P", onClick: () => router.push("/dashboard/p2p") },
            ].map((action, i) => (
              <button type="button" id={`quick-${action.label.toLowerCase()}`} key={i} onClick={action.onClick} className="flex flex-col items-center gap-2 cursor-pointer group">
                <div className="w-14 h-14 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300 shadow-sm transition-all group-hover:scale-105 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-900/30 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:border-emerald-200 dark:group-hover:border-emerald-800">
                  <action.icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{action.label}</span>
              </button>
            ))}
          </motion.div>

          {/* Calculadora / Conversor Rápido Cripto ⇄ Bolívares */}
          <motion.div variants={itemVariants}>
            <CryptoCalculatorWidget initialRates={rates} />
          </motion.div>
        </div>

        {/* Right Column: Assets & Activity */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Assets List */}
          <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-4">Activos</h3>
            <div className="space-y-4">
              
              {/* Asset Item: USDT */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-inner">
                    <span className="text-white font-bold text-lg">₮</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-50">Tether US</h4>
                    <span className="text-xs font-medium text-zinc-500">USDT · TRC20</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-50">{loading ? "..." : usdtBalance.toFixed(2)}</div>
                    <div className="text-xs font-medium text-zinc-400 flex items-center justify-end gap-1" title={overview ? `Anuncios: ${overview.locked.ads.toFixed(2)} · Escrow: ${overview.locked.escrow.toFixed(2)} · Retiros: ${overview.locked.withdrawals.toFixed(2)}` : ""}>
                      <LockIcon className="w-3 h-3" /> Bloqueado: {lockedBalance.toFixed(2)}
                    </div>
                  </div>
                  <button
                    type="button"
                    id="dashboard-deposit-usdt-btn"
                    onClick={() => setMode("deposit")}
                    className="hidden sm:flex px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white font-bold text-xs transition-transform hover:scale-105 active:scale-95 items-center gap-1.5 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Depositar USDT
                  </button>
                </div>
              </div>

            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Actividad Reciente</h3>
              <button onClick={() => router.push('/dashboard/history')} className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">Ver todo</button>
            </div>
            <div className="space-y-1">
              <VisualHistory rows={(overview?.recent ?? []).slice(0, 8)} hideBalance={hideBalance} />
            </div>
          </motion.div>

        </div>
      </div>
      <FundsModal mode={mode} onClose={() => setMode(null)} available={usdtBalance} onChanged={load} />
    </motion.div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function VisualHistory({ rows, hideBalance }: { rows: LedgerRow[], hideBalance: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center bg-zinc-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
        <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-3">
          <BarChart3 className="w-6 h-6 text-zinc-400" />
        </div>
        <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Sin actividad</p>
        <p className="text-xs text-zinc-500 mt-1 max-w-[200px]">Tus depósitos y operaciones P2P aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
      {rows.map((r) => {
        const positive = r.amount > 0;
        const neutral = r.amount === 0;
        const Icon = r.type === "AD_FREEZE" || r.type === "P2P_ESCROW" ? Lock : r.type === "AD_UNFREEZE" || r.type === "P2P_REFUND" ? Unlock : positive ? ArrowDownLeft : ArrowUpRight;
        
        return (
          <div key={r.id} className="flex items-center justify-between py-3.5 group hover:bg-zinc-50 dark:hover:bg-zinc-800/30 px-3 -mx-3 rounded-2xl transition-colors">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm border ${neutral ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500" : positive ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-900/30 border-rose-100 dark:border-rose-800 text-rose-600 dark:text-rose-400"}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50 truncate">{LEDGER_LABELS[r.type] ?? r.type}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-zinc-500">{new Date(r.createdAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}</span>
                  {r.note && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span>
                      <span className="text-xs text-zinc-500 truncate flex-1">{r.note}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right pl-3">
              <span className={`text-sm font-black whitespace-nowrap flex-shrink-0 ${neutral ? "text-zinc-500" : positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {neutral ? "—" : hideBalance ? "••••" : `${positive ? "+" : "−"}${Math.abs(r.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
              <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mt-0.5">USDT</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
