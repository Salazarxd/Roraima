"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, Users, ShieldAlert, Wallet, TrendingUp, UserCheck, Scale, CheckCircle2, XCircle,
  Loader2, AlertTriangle, RefreshCw, Activity, ShieldX, ArrowUpRight, Coins, LifeBuoy, ExternalLink,
  ClipboardCheck, UserPlus, UserMinus, Hourglass, Crown, Headset, LogOut, LayoutDashboard, Settings, Save,
  Copy, Check, Video, Play, UploadCloud, Smartphone, Monitor, Eye,
} from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { getIdToken, waitForUser } from "@/lib/client-auth";
import { auth } from "@/lib/firebase";
import {
  getStaffSession, getAdminStats, getProposals, reviewProposal, listStaff, setStaffRole, listVipMembers, setVipMembership, fetchSystemSettings, saveSystemSettings
} from "@/app/actions/admin";
import { getPendingWithdrawals, approveWithdrawal, rejectWithdrawal } from "@/app/actions/funds";
import type { SystemSettings } from "@/lib/settings";

import { KycTab, TribunalTab, ProposalCard, containerVariants, itemVariants, fmt, ago } from "@/components/staff-tabs";
import { LedgerTab } from "@/components/admin-ledger";

type Stats = Extract<Awaited<ReturnType<typeof getAdminStats>>, { success: true }>["stats"];
type PendingWithdrawal = Awaited<ReturnType<typeof getPendingWithdrawals>>["withdrawals"][number];
type Proposal = Awaited<ReturnType<typeof getProposals>>["proposals"][number];
type StaffMember = Awaited<ReturnType<typeof listStaff>>["staff"][number];
type VipMember = Awaited<ReturnType<typeof listVipMembers>>["members"][number];
type Tab = "dashboard" | "approvals" | "kyc" | "withdrawals" | "tribunal" | "team" | "vip" | "ledger" | "settings";



export default function AdminDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<Tab>("tribunal");
  const [gate, setGate] = React.useState<"loading" | "denied" | "support" | "ok">("loading");
  const [staff, setStaff] = React.useState<{ name: string | null; email: string; role: string } | null>(null);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [toast, setToast] = React.useState<{ type: "error" | "success"; text: string } | null>(null);

  const showToast = React.useCallback((type: "error" | "success", text: string) => {
    setToast({ type, text });
    if (type === "success") sonnerToast.success(text);
    else sonnerToast.error(text);
    setTimeout(() => setToast(null), 4500);
  }, []);

  // RBAC: el servidor decide. El Admin Center es EXCLUSIVO del rol ADMIN.
  React.useEffect(() => {
    (async () => {
      const user = await waitForUser();
      if (!user) return router.push("/auth");
      const res = await getStaffSession(await user.getIdToken());
      if (!res.success) return setGate("denied");
      setStaff(res.staff);
      setGate(res.staff.role === "ADMIN" ? "ok" : "support");
    })();
  }, [router]);

  const refreshPending = React.useCallback(async () => {
    const res = await getProposals(await getIdToken(), "PENDING");
    if (res.success) setPendingCount(res.proposals.length);
  }, []);

  React.useEffect(() => {
    if (gate !== "ok") return;
    const t = setTimeout(refreshPending, 0);
    const i = setInterval(refreshPending, 20000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [gate, refreshPending]);

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/auth");
  };

  if (gate === "loading") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (gate === "denied" || gate === "support") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md text-center bg-white dark:bg-zinc-900 rounded-[2rem] p-10 border border-zinc-200/50 dark:border-zinc-800/50 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto mb-5"><ShieldX className="w-8 h-8 text-rose-500" /></div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Acceso restringido</h1>
          <p className="text-sm text-zinc-500 mb-6">
            {gate === "support"
              ? "El Admin Center es exclusivo de los administradores. Tu rol de Soporte trabaja desde el Panel de Soporte."
              : "Esta área es exclusiva para la Administración de Roraima Exchange."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {gate === "support" && (
              <Link href="/support-panel" className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-colors">Ir al Panel de Soporte</Link>
            )}
            <button onClick={() => router.push("/dashboard")} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors">Volver al panel</button>
          </div>
        </motion.div>
      </div>
    );
  }

  const initials = (staff?.name || staff?.email || "SA").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const tabs: { id: Tab; icon: typeof BarChart3; label: string; badge?: number }[] = [
    { id: "dashboard", icon: BarChart3, label: "Métricas" },
    { id: "approvals", icon: ClipboardCheck, label: "Aprobaciones", badge: pendingCount },
    { id: "tribunal", icon: Scale, label: "Tribunal" },
    { id: "kyc", icon: UserCheck, label: "KYC" },
    { id: "withdrawals", icon: ArrowUpRight, label: "Retiros" },
    { id: "team", icon: Users, label: "Equipo" },
    { id: "vip", icon: Crown, label: "VIP" },
    { id: "ledger", icon: ShieldAlert, label: "Libro Mayor" },
    { id: "settings", icon: Settings, label: "Ajustes" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className={`fixed top-6 left-1/2 z-[100] px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-center gap-3 text-sm font-semibold max-w-[90vw] ${
              toast.type === "error" ? "bg-rose-50/95 dark:bg-rose-950/90 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300" : "bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {toast.type === "error" ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Topbar */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-zinc-900 dark:text-zinc-50 leading-tight">Admin Center</h1>
            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Roraima Exchange · Administrador</span>
          </div>
        </div>

        <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-full p-1 overflow-x-auto max-w-full order-3 lg:order-none w-full lg:w-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`admin-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.id ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {!!tab.badge && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-violet-600 text-white text-[10px] font-black flex items-center justify-center">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/support-panel" title="Panel de Soporte" className="p-2.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"><LifeBuoy className="w-5 h-5" /></Link>
          <Link href="/dashboard" title="Mi cuenta" className="p-2.5 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"><LayoutDashboard className="w-5 h-5" /></Link>
          <ThemeToggle />
          <div title={staff?.email} className="hidden md:flex w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold border-2 border-indigo-200 dark:border-indigo-800">
            {initials}
          </div>
          <button onClick={handleLogout} title="Cerrar sesión" className="p-2.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"><LogOut className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && <MetricsTab key="dashboard" onError={(t) => showToast("error", t)} onOpen={setActiveTab} />}
          {activeTab === "approvals" && <ApprovalsTab key="approvals" toast={showToast} onChange={refreshPending} />}
          {activeTab === "kyc" && <KycTab key="kyc" toast={showToast} mode="ADMIN" />}
          {activeTab === "withdrawals" && <WithdrawalsTab key="withdrawals" toast={showToast} />}
          {activeTab === "tribunal" && <TribunalTab key="tribunal" toast={showToast} mode="ADMIN" />}
          {activeTab === "team" && <TeamTab key="team" toast={showToast} />}
          {activeTab === "vip" && <VipTab key="vip" toast={showToast} />}
          {activeTab === "ledger" && <LedgerTab key="ledger" toast={showToast} />}
          {activeTab === "settings" && <SettingsTab key="settings" toast={showToast} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
//  MÉTRICAS
// ============================================================================
function MetricsTab({ onError, onOpen }: { onError: (t: string) => void; onOpen: (t: Tab) => void }) {
  const [stats, setStats] = React.useState<Stats | null>(null);

  React.useEffect(() => {
    (async () => {
      const res = await getAdminStats(await getIdToken());
      if (res.success) setStats(res.stats);
      else onError(res.error);
    })();
  }, [onError]);

  if (!stats) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  const max = Math.max(1, ...stats.daily.map((d) => d.volume));
  const weekTotal = stats.daily.reduce((s, d) => s + d.volume, 0);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden" className="space-y-8">
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Rendimiento Global</h2>
        <p className="text-sm text-zinc-500">Datos operativos en tiempo real desde la base de datos.</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: "Volumen Completado", value: `${fmt(stats.completedVolume)} USDT`, sub: `${stats.completedTrades} órdenes`, icon: Wallet, color: "text-indigo-500", bg: "bg-indigo-100 dark:bg-indigo-900/30" },
          { title: "Órdenes Activas", value: String(stats.activeTrades), sub: "pendientes o pagadas", icon: Activity, color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
          { title: "Usuarios Registrados", value: String(stats.users), sub: `${stats.pendingKyc} KYC pendientes`, icon: Users, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30" },
          { title: "Disputas Abiertas", value: String(stats.disputes), sub: stats.disputes ? "requieren mediación" : "todo en orden", icon: ShieldAlert, color: "text-rose-500", bg: "bg-rose-100 dark:bg-rose-900/30" },
        ].map((stat, idx) => (
          <motion.div key={idx} variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-sm border border-zinc-200/50 dark:border-zinc-800/50 hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <h3 className="text-zinc-500 dark:text-zinc-400 font-medium text-sm mb-1">{stat.title}</h3>
            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{stat.value}</div>
            <div className="text-xs text-zinc-400 mt-1">{stat.sub}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: "Aprobaciones pendientes", value: String(stats.pendingProposals), sub: stats.pendingProposals ? "propuestas de Soporte" : "nada por aprobar", icon: ClipboardCheck, color: "text-violet-500", bg: "bg-violet-100 dark:bg-violet-900/30", tab: "approvals" as Tab, href: null },
          { title: "Ingresos por comisiones", value: `${fmt(stats.feeRevenue, 4)} USDT`, sub: "0.1% por orden al anunciante", icon: Coins, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/30", tab: null, href: null },
          { title: "Retiros pendientes", value: String(stats.pendingWithdrawals), sub: stats.pendingWithdrawals ? "esperan procesamiento" : "cola vacía", icon: ArrowUpRight, color: "text-fuchsia-500", bg: "bg-fuchsia-100 dark:bg-fuchsia-900/30", tab: "withdrawals" as Tab, href: null },
          { title: "Tickets de soporte", value: String(stats.openTickets), sub: "abiertos o en curso", icon: LifeBuoy, color: "text-sky-500", bg: "bg-sky-100 dark:bg-sky-900/30", tab: null, href: "/support-panel" },
        ].map((stat, idx) => {
          const card = (
            <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-sm border border-zinc-200/50 dark:border-zinc-800/50 hover:shadow-lg hover:-translate-y-0.5 transition-all h-full text-left">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${stat.bg}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium text-sm mb-1">{stat.title}</h3>
              <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{stat.value}</div>
              <div className="text-xs text-zinc-400 mt-1">{stat.sub}</div>
            </motion.div>
          );
          if (stat.href) return <Link key={idx} href={stat.href}>{card}</Link>;
          if (stat.tab) { const t = stat.tab; return <button key={idx} type="button" onClick={() => onOpen(t)} className="block w-full">{card}</button>; }
          return <React.Fragment key={idx}>{card}</React.Fragment>;
        })}
      </div>

      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 sm:p-8 shadow-sm border border-zinc-200/50 dark:border-zinc-800/50">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-lg">Volumen Semanal</h3>
            <p className="text-xs text-zinc-500">Últimos 7 días (USDT completados)</p>
          </div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-2"><TrendingUp className="w-5 h-5" /> {fmt(weekTotal)}</div>
        </div>
        <div className="h-56 flex items-end gap-3">
          {stats.daily.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
              <span className="text-[10px] font-bold text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">{fmt(d.volume)}</span>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(4, (d.volume / max) * 100)}%` }}
                transition={{ delay: i * 0.06, type: "spring", stiffness: 120, damping: 18 }}
                className={`w-full rounded-xl ${d.volume ? "bg-gradient-to-t from-indigo-600 to-violet-400" : "bg-zinc-100 dark:bg-zinc-800"}`}
              />
              <span className="text-xs text-zinc-500 capitalize">{d.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
//  RETIROS (Fase 1: Despacho Manual por Super Admin & Tesorería)
// ============================================================================
function WithdrawalsTab({ toast }: { toast: (type: "error" | "success", t: string) => void }) {
  const [rows, setRows] = React.useState<PendingWithdrawal[] | null>(null);
  const [hotWallet, setHotWallet] = React.useState<string | null>(null);
  const [action, setAction] = React.useState<{ w: PendingWithdrawal; mode: "approve" | "reject" } | null>(null);
  const [input, setInput] = React.useState("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await getPendingWithdrawals(await getIdToken());
    setRows(res.withdrawals);
    setHotWallet(res.hotWallet);
    if (!res.success) toast("error", res.error);
  }, [toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 0);
    const i = setInterval(load, 20000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [load]);

  const copyAddress = (addr: string, id: string) => {
    navigator.clipboard?.writeText(addr);
    setCopiedId(id);
    sonnerToast.success("Dirección TRON copiada al portapapeles");
    setTimeout(() => setCopiedId(null), 2500);
  };

  const submit = async () => {
    if (!action) return;
    setBusy(true);
    const token = await getIdToken();
    const res = action.mode === "approve"
      ? await approveWithdrawal(token, action.w.id, { isManual: true, txid: input.trim() })
      : await rejectWithdrawal(token, action.w.id, input.trim() || "Retiro rechazado por el administrador - Fondos devueltos al saldo");
    setBusy(false);
    if (res.success) {
      const msg = action.mode === "approve"
        ? `¡Retiro manual aprobado! Se completó el retiro de ${action.w.netAmount} USDT.`
        : `Retiro rechazado. Se devolvieron +${fmt(action.w.amount)} USDT al balance del usuario.`;
      toast("success", msg);
      setAction(null);
      setInput("");
      load();
    } else {
      toast("error", res.error);
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden" className="space-y-6">
      {/* Encabezado y Contexto de Seguridad */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight">
              Retiros Pendientes
            </h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Fase 1: Despacho Manual
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
            Por seguridad, todos los retiros en USDT se autorizan manualmente. Realiza la transferencia desde la billetera de tesorería y confirma la aprobación para actualizar el estado del usuario.
          </p>
          {hotWallet && (
            <p className="text-xs text-zinc-400 mt-2 font-mono flex items-center gap-1.5">
              <span className="text-zinc-500">Billetera de tesorería sugerida:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{hotWallet}</span>
            </p>
          )}
        </div>
        <button
          onClick={load}
          className="p-3 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 hover:border-emerald-500 text-zinc-600 dark:text-zinc-300 transition-all shadow-sm hover:scale-105 active:scale-95 self-start sm:self-auto"
          title="Actualizar lista"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </motion.div>

      {/* Tabla Estilo Dark Glass */}
      <motion.div
        variants={itemVariants}
        className="bg-white/85 dark:bg-zinc-900/80 backdrop-blur-2xl rounded-[2.5rem] border border-zinc-200/60 dark:border-emerald-500/20 shadow-2xl shadow-emerald-950/10 overflow-hidden"
      >
        {rows === null ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <span className="text-xs text-zinc-400">Consultando solicitudes en estado PENDING...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Al día sin pendientes</h3>
            <p className="text-xs text-zinc-400 mt-1">No hay solicitudes de retiro en estado PENDING en este momento.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/70 dark:bg-zinc-950/60 border-b border-zinc-200/80 dark:border-zinc-800/80 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Nombre del Usuario</th>
                  <th className="px-6 py-4">Monto a Retirar</th>
                  <th className="px-6 py-4">Dirección Externa (Destino)</th>
                  <th className="px-6 py-4">Solicitado</th>
                  <th className="px-6 py-4 text-center">Acciones Operativas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-sm">
                {rows.map((w) => (
                  <tr key={w.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-950/40 transition-colors">
                    {/* Nombre del Usuario */}
                    <td className="px-6 py-5">
                      <div className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                        {w.user.name || w.user.email}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">{w.user.email}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          w.user.kycStatus === "VERIFIED"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        }`}>
                          KYC {w.user.kycStatus}
                        </span>
                      </div>
                    </td>

                    {/* Monto a retirar */}
                    <td className="px-6 py-5">
                      <div className="flex items-baseline gap-1 text-emerald-600 dark:text-emerald-400 font-extrabold text-xl">
                        <span>{w.netAmount}</span>
                        <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">USDT (Neto)</span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Total: {fmt(w.amount)} USDT · Comisión: {fmt(w.fee)} USDT
                      </div>
                    </td>

                    {/* Dirección Externa de destino */}
                    <td className="px-6 py-5 max-w-xs">
                      <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800">
                        <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100 font-bold break-all select-all flex-1">
                          {w.address}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyAddress(w.address, w.id)}
                          className="p-1.5 rounded-lg bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0"
                          title="Copiar dirección"
                        >
                          {copiedId === w.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <a
                          href={`https://tronscan.org/#/address/${w.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 transition-colors shrink-0"
                          title="Ver en TronScan"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      <span className="text-[10px] text-zinc-400 mt-1 block">Red TRON (TRC20)</span>
                    </td>

                    {/* Fecha de solicitud */}
                    <td className="px-6 py-5 text-xs text-zinc-500 whitespace-nowrap">
                      {ago(w.createdAt)}
                    </td>

                    {/* Botones Enormes de Aprobación / Rechazo */}
                    <td className="px-6 py-5">
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
                        <button
                          id={`wd-approve-${w.id.slice(0, 8)}`}
                          onClick={() => {
                            setAction({ w, mode: "approve" });
                            setInput("");
                          }}
                          className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Aprobar (Retiro Manual)</span>
                        </button>

                        <button
                          id={`wd-reject-${w.id.slice(0, 8)}`}
                          onClick={() => {
                            setAction({ w, mode: "reject" });
                            setInput("");
                          }}
                          className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-rose-600/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Rechazar (Devolver saldo)</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Modal Interactivo Estilo Dark Glass */}
      <AnimatePresence>
        {action && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => !busy && setAction(null)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-white/95 dark:bg-zinc-950/90 backdrop-blur-2xl rounded-[2.5rem] p-7 sm:p-8 shadow-2xl border border-zinc-200/70 dark:border-emerald-500/30 space-y-5"
            >
              {/* Header Modal */}
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                  action.mode === "approve"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 shadow-rose-500/20"
                }`}>
                  {action.mode === "approve" ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">
                    {action.mode === "approve" ? "Aprobar Retiro Manual" : "Rechazar Retiro y Devolver Saldo"}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Usuario: {action.w.user.name || action.w.user.email}
                  </p>
                </div>
              </div>

              {action.mode === "approve" ? (
                <div className="space-y-4">
                  {/* Tarjeta de Monto a Transferir */}
                  <div className="p-4 bg-emerald-500/10 dark:bg-emerald-500/[0.08] rounded-2xl border border-emerald-500/20 text-center">
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 block mb-1 uppercase tracking-wider">
                      Monto Neto Exacto a Transferir
                    </span>
                    <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                      {action.w.netAmount} USDT
                    </div>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      (Comisión de red descontada: {action.w.fee} USDT)
                    </span>
                  </div>

                  {/* Dirección de Destino */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                      Dirección externa de destino (TRC-20):
                    </label>
                    <div className="p-3 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100 break-all select-all">
                        {action.w.address}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyAddress(action.w.address, "modal")}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors shrink-0"
                      >
                        {copiedId === "modal" ? "¡Copiado!" : "Copiar"}
                      </button>
                    </div>
                  </div>

                  {/* Input Opcional TXID */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                      TXID / Hash de la transacción (Opcional):
                    </label>
                    <input
                      id="wd-txid-input"
                      value={input}
                      onChange={(e) => setInput(e.target.value.trim())}
                      placeholder="Pega aquí el TXID de TronScan si ya enviaste los fondos..."
                      className="w-full font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 outline-none focus:border-emerald-500 text-zinc-900 dark:text-zinc-100"
                    />
                    <span className="text-[11px] text-zinc-400 block">
                      Si lo dejas en blanco, el sistema registrará un comprobante de despacho manual automáticamente.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Tarjeta de Reembolso */}
                  <div className="p-4 bg-rose-500/10 dark:bg-rose-500/[0.08] rounded-2xl border border-rose-500/20 text-center">
                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 block mb-1 uppercase tracking-wider">
                      Monto a Reintegrar al Usuario
                    </span>
                    <div className="text-3xl font-black text-rose-600 dark:text-rose-400">
                      +{fmt(action.w.amount)} USDT
                    </div>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Los fondos regresarán inmediatamente al balance disponible del usuario.
                    </span>
                  </div>

                  {/* Motivo de Rechazo */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                      Motivo del rechazo (Visible para el usuario):
                    </label>
                    <textarea
                      id="wd-reject-note"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="Ej: La dirección no soporta red TRC-20 o fue solicitada la cancelación por el usuario."
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-rose-500 text-zinc-900 dark:text-zinc-100 resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Acciones del Modal */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAction(null)}
                  disabled={busy}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  id="wd-confirm-btn"
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className={`flex-[1.5] py-3.5 rounded-2xl font-extrabold text-xs sm:text-sm text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
                    action.mode === "approve"
                      ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 shadow-emerald-600/30"
                      : "bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600 shadow-rose-600/30"
                  }`}
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {action.mode === "approve" ? "Confirmar Aprobación (Retiro Manual)" : "Confirmar Rechazo (Devolver Saldo)"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================================
//  APROBACIONES (doble control: propuestas del rol SUPPORT)
// ============================================================================

function ApprovalsTab({ toast, onChange }: { toast: (type: "error" | "success", t: string) => void; onChange: () => void }) {
  const [view, setView] = React.useState<"PENDING" | "HISTORY">("PENDING");
  const [rows, setRows] = React.useState<Proposal[] | null>(null);
  const [review, setReview] = React.useState<{ p: Proposal; approve: boolean } | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setRows(null);
    const res = await getProposals(await getIdToken(), view);
    setRows(res.proposals);
    if (!res.success) toast("error", res.error);
  }, [view, toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const submit = async () => {
    if (!review) return;
    setBusy(true);
    const res = await reviewProposal(await getIdToken(), review.p.id, review.approve, note);
    setBusy(false);
    if (res.success) {
      toast("success", review.approve ? "Propuesta aprobada y ejecutada" : "Propuesta rechazada");
      setReview(null);
      setNote("");
    } else toast("error", res.error);
    load();
    onChange();
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden" className="space-y-6">
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Aprobaciones</h2>
          <p className="text-sm text-zinc-500">Decisiones propuestas por el equipo de Soporte. Nada se ejecuta sin tu aprobación.</p>
        </div>
        <div className="flex items-center gap-2">
          {(["PENDING", "HISTORY"] as const).map((v) => (
            <button key={v} id={`approvals-${v.toLowerCase()}`} onClick={() => setView(v)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${view === v ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"}`}>
              {v === "PENDING" ? "Pendientes" : "Historial"}
            </button>
          ))}
          <button onClick={load} className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 transition-colors"><RefreshCw className="w-4 h-4 text-zinc-500" /></button>
        </div>
      </motion.div>

      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : rows.length === 0 ? (
        <motion.div variants={itemVariants} className="text-center py-16 bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/50 dark:border-zinc-800/50 text-zinc-500">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
          {view === "PENDING" ? "No hay propuestas esperando tu aprobación." : "Aún no hay propuestas revisadas."}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {rows.map((p) => (
            <ProposalCard
              key={p.id}
              p={p}
              actions={
                p.status === "PENDING" ? (
                  <div className="flex gap-3 mt-4">
                    <button id={`proposal-reject-${p.id.slice(0, 8)}`} onClick={() => { setNote(""); setReview({ p, approve: false }); }} className="flex-1 py-2.5 rounded-xl font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors">Rechazar</button>
                    <button id={`proposal-approve-${p.id.slice(0, 8)}`} onClick={() => { setNote(""); setReview({ p, approve: true }); }} className="flex-[1.4] py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-colors">Aprobar y ejecutar</button>
                  </div>
                ) : null
              }
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {review && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busy && setReview(null)}>
            <motion.div initial={{ scale: 0.92, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl border border-zinc-100 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">{review.approve ? "Aprobar propuesta" : "Rechazar propuesta"}</h3>
              <p className="text-sm text-zinc-500 mb-4">
                {review.approve
                  ? <>Se ejecutará <b>{review.p.decisionLabel}</b> sobre <b>{review.p.target.label}</b> con tu firma de administrador. {review.p.kind === "DISPUTE" && "Movimiento de fondos irreversible."}</>
                  : <>La propuesta de <b>{review.p.proposer}</b> quedará rechazada y el caso seguirá abierto.</>}
              </p>
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">{review.approve ? "Nota (opcional)" : "Motivo del rechazo (visible para el agente)"}</label>
              <textarea id="proposal-review-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 resize-none mb-5" />
              <div className="flex gap-3">
                <button onClick={() => setReview(null)} disabled={busy} className="flex-1 py-3 rounded-2xl font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Volver</button>
                <button id="proposal-review-confirm" onClick={submit} disabled={busy || (!review.approve && note.trim().length < 5)} className={`flex-[1.4] py-3 rounded-2xl font-bold text-white shadow-lg disabled:opacity-40 transition-all flex items-center justify-center gap-2 ${review.approve ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} {review.approve ? "Aprobar y ejecutar" : "Rechazar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================================
//  EQUIPO (asignación del rol SUPPORT)
// ============================================================================
function TeamTab({ toast }: { toast: (type: "error" | "success", t: string) => void }) {
  const [members, setMembers] = React.useState<StaffMember[] | null>(null);
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [revoke, setRevoke] = React.useState<StaffMember | null>(null);

  const load = React.useCallback(async () => {
    const res = await listStaff(await getIdToken());
    setMembers(res.staff);
    if (!res.success) toast("error", res.error);
  }, [toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const change = async (target: string, role: "SUPPORT" | "USER") => {
    setBusy(true);
    const res = await setStaffRole(await getIdToken(), target, role);
    setBusy(false);
    if (res.success) {
      toast("success", role === "SUPPORT" ? "Agente de soporte agregado" : "Rol de soporte revocado");
      setEmail("");
      setRevoke(null);
      load();
    } else toast("error", res.error);
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden" className="space-y-6">
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Equipo</h2>
        <p className="text-sm text-zinc-500">El rol Soporte atiende tickets y propone decisiones; solo un administrador las ejecuta.</p>
      </motion.div>

      <motion.form
        variants={itemVariants}
        onSubmit={(e) => { e.preventDefault(); if (email.trim()) change(email, "SUPPORT"); }}
        className="bg-white dark:bg-zinc-900 rounded-[2rem] p-5 sm:p-6 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm flex flex-col sm:flex-row gap-3 sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor="team-email" className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">Agregar agente de soporte</label>
          <input id="team-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com (usuario registrado con KYC verificado)" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" />
        </div>
        <button id="team-add" type="submit" disabled={busy || !email.trim()} className="px-5 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Asignar rol Soporte
        </button>
      </motion.form>

      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden">
        {members === null ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-200 dark:border-zinc-800">
                  {["Miembro", "Rol", "KYC", "Propuestas", ""].map((h) => (
                    <th key={h} className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-50">{m.name}</div>
                      <div className="text-xs text-zinc-500">{m.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      {m.role === "ADMIN" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"><Crown className="w-3 h-3" /> Administrador</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"><Headset className="w-3 h-3" /> Soporte</span>
                      )}
                    </td>
                    <td className="px-6 py-4"><span className={`text-xs font-bold ${m.kycStatus === "VERIFIED" ? "text-emerald-500" : "text-amber-500"}`}>{m.kycStatus}</span></td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      {m.role === "SUPPORT" ? (
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1"><Hourglass className="w-3 h-3 text-violet-500" />{m.proposals.pending}</span>
                          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />{m.proposals.approved}</span>
                          <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-rose-500" />{m.proposals.rejected}</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {m.role === "SUPPORT" && (
                        <button onClick={() => setRevoke(m)} title="Revocar rol" className="p-2 rounded-xl bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400 transition-colors"><UserMinus className="w-4 h-4" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {revoke && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busy && setRevoke(null)}>
            <motion.div initial={{ scale: 0.92, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl border border-zinc-100 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Revocar rol de Soporte</h3>
              <p className="text-sm text-zinc-500 mb-6"><b>{revoke.name}</b> ({revoke.email}) volverá a ser un usuario normal y sus propuestas pendientes quedarán anuladas.</p>
              <div className="flex gap-3">
                <button onClick={() => setRevoke(null)} disabled={busy} className="flex-1 py-3 rounded-2xl font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Volver</button>
                <button id="team-revoke-confirm" onClick={() => change(revoke.email, "USER")} disabled={busy} className="flex-[1.4] py-3 rounded-2xl font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} Revocar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================================
//  VIP (anuncios promocionados: salen primero en el mercado y en Compra rápida)
// ============================================================================
function VipTab({ toast }: { toast: (type: "error" | "success", t: string) => void }) {
  const [members, setMembers] = React.useState<VipMember[] | null>(null);
  const [email, setEmail] = React.useState("");
  const [days, setDays] = React.useState(30);
  const [busy, setBusy] = React.useState(false);

  const [now, setNow] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    const res = await listVipMembers(await getIdToken());
    setMembers(res.members);
    setNow(Date.now());
    if (!res.success) toast("error", res.error);
  }, [toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const apply = async (target: string, d: number) => {
    setBusy(true);
    const res = await setVipMembership(await getIdToken(), target, d);
    setBusy(false);
    if (res.success) {
      toast("success", d === 0 ? "Membresía VIP revocada" : `VIP activo hasta el ${new Date(res.vipUntil!).toLocaleDateString("es-VE")}`);
      setEmail("");
      load();
    } else toast("error", res.error);
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden" className="space-y-6">
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Membresías VIP</h2>
        <p className="text-sm text-zinc-500">Los anuncios de los miembros VIP salen primero en el mercado P2P y son los que ofrece Rori en la Compra rápida. Actívala al confirmar el pago de la membresía.</p>
      </motion.div>

      <motion.form
        variants={itemVariants}
        onSubmit={(e) => { e.preventDefault(); if (email.trim()) apply(email, days); }}
        className="bg-white dark:bg-zinc-900 rounded-[2rem] p-5 sm:p-6 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm flex flex-col lg:flex-row gap-3 lg:items-end"
      >
        <div className="flex-1">
          <label htmlFor="vip-email" className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">Otorgar o extender VIP</label>
          <input id="vip-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com (usuario con KYC verificado)" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-amber-500" />
        </div>
        <div className="flex gap-2">
          {[30, 90, 365].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={`px-4 py-3 rounded-xl text-sm font-bold border transition-colors ${days === d ? "bg-amber-400 border-amber-400 text-amber-950" : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300"}`}>
              {d === 365 ? "1 año" : `${d} días`}
            </button>
          ))}
        </div>
        <button id="vip-grant" type="submit" disabled={busy || !email.trim()} className="px-5 py-3 rounded-xl font-bold text-amber-950 bg-gradient-to-r from-amber-400 to-yellow-300 hover:brightness-105 disabled:opacity-40 transition flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />} Activar VIP
        </button>
      </motion.form>

      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden">
        {members === null ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
        ) : members.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-500">Aún no hay miembros VIP activos.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-200 dark:border-zinc-800">
                  {["Miembro", "Vence", "Anuncios abiertos", ""].map((h) => (
                    <th key={h} className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {members.map((m) => {
                  const left = now ? Math.ceil((new Date(m.vipUntil).getTime() - now) / 86400000) : 0;
                  return (
                    <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-1.5"><Crown className="w-3.5 h-3.5 text-amber-500" />{m.name}</div>
                        <div className="text-xs text-zinc-500">{m.email}</div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-50">{new Date(m.vipUntil).toLocaleDateString("es-VE")}</div>
                        <div className={`text-xs ${left <= 5 ? "text-amber-500 font-bold" : "text-zinc-500"}`}>{left} día{left === 1 ? "" : "s"} restantes</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-700 dark:text-zinc-300">{m.openAds}</td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <button onClick={() => apply(m.email, 30)} disabled={busy} className="mr-2 px-3 py-2 rounded-xl text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 transition-colors">+30 días</button>
                        <button onClick={() => apply(m.email, 0)} disabled={busy} title="Revocar VIP" className="p-2 rounded-xl bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400 transition-colors"><UserMinus className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
//  CONFIGURACIONES DEL SISTEMA
// ============================================================================
function SettingsTab({ toast }: { toast: (type: "success" | "error", text: string) => void }) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [settings, setSettings] = React.useState<Partial<SystemSettings>>({});

  // Estados específicos para el Video de Presentación
  const [introEnabled, setIntroEnabled] = React.useState(true);
  const [desktopUrl, setDesktopUrl] = React.useState("/videos/presentacion.mp4");
  const [mobileUrl, setMobileUrl] = React.useState("");
  const [uploadingTarget, setUploadingTarget] = React.useState<"desktop" | "mobile" | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);

  const desktopFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const mobileFileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    (async () => {
      const res = await fetchSystemSettings(await getIdToken());
      if (res.success && res.settings) {
        setSettings(res.settings);
        setIntroEnabled(res.settings.introVideoEnabled ?? true);
        setDesktopUrl(res.settings.introVideoDesktopUrl || "/videos/presentacion.mp4");
        setMobileUrl(res.settings.introVideoMobileUrl || "");
      } else {
        toast("error", res.error || "No se cargaron los ajustes");
      }
      setLoading(false);
    })();
  }, [toast]);

  const handleUploadVideo = async (file: File, deviceType: "desktop" | "mobile") => {
    try {
      setUploadingTarget(deviceType);
      setUploadProgress(0);
      const token = await getIdToken();

      const formData = new FormData();
      formData.append("file", file);
      formData.append("deviceType", deviceType);
      formData.append("idToken", token);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/upload-video");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        setUploadingTarget(null);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success && data.url) {
              if (deviceType === "desktop") {
                setDesktopUrl(data.url);
              } else {
                setMobileUrl(data.url);
              }
              toast("success", `Video para ${deviceType === "desktop" ? "escritorio" : "móvil"} subido exitosamente`);
            } else {
              toast("error", data.error || "Error al subir video");
            }
          } catch {
            toast("error", "Error al procesar la respuesta del servidor");
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            toast("error", data.error || `Error HTTP ${xhr.status}`);
          } catch {
            toast("error", `Error HTTP ${xhr.status}`);
          }
        }
      };

      xhr.onerror = () => {
        setUploadingTarget(null);
        toast("error", "Error de red al subir el video");
      };

      xhr.send(formData);
    } catch (err: any) {
      setUploadingTarget(null);
      toast("error", err?.message || "Error al procesar el archivo");
    }
  };

  const handleTestIntro = (urlToTest?: string) => {
    const target = urlToTest || desktopUrl;
    if (!target) {
      toast("error", "No hay ningún video configurado para probar.");
      return;
    }
    window.dispatchEvent(new CustomEvent("roraima-play-intro", { detail: { targetUrl: target } }));
    toast("success", "Iniciando demostración en vivo del video de bienvenida...");
  };

  const handleResetDailyLimit = () => {
    try {
      localStorage.removeItem("roraima_intro_last_viewed_date");
      toast("success", "Límite diario reseteado para este navegador. Al recargar la web se reproducirá de nuevo.");
    } catch {
      toast("error", "No se pudo limpiar el almacenamiento local");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const updates: Partial<SystemSettings> = {
      tronDepositAddress: String(fd.get("tronDepositAddress") ?? ""),
      tronHotWalletAddress: String(fd.get("tronHotWalletAddress") ?? ""),
      trongridApiKey: String(fd.get("trongridApiKey") ?? ""),
      appName: String(fd.get("appName") ?? ""),
      logoUrl: String(fd.get("logoUrl") ?? ""),
      heroTitle: String(fd.get("heroTitle") ?? ""),
      heroSubtitle: String(fd.get("heroSubtitle") ?? ""),
      withdrawFeeUsdt: Number(fd.get("withdrawFeeUsdt")),
      vipMembershipUsdt: Number(fd.get("vipMembershipUsdt")),
      makerFeeRate: Number(fd.get("makerFeeRate")),
      supportEmail: String(fd.get("supportEmail") ?? ""),
      smtpHost: String(fd.get("smtpHost") ?? ""),
      smtpPort: Number(fd.get("smtpPort")),
      smtpUser: String(fd.get("smtpUser") ?? ""),
      smtpPass: String(fd.get("smtpPass") ?? ""),
      introVideoEnabled: introEnabled,
      introVideoDesktopUrl: desktopUrl,
      introVideoMobileUrl: mobileUrl,
    };
    const res = await saveSystemSettings(await getIdToken(), updates);
    if (res.success) {
      toast("success", "Ajustes guardados correctamente");
    } else {
      toast("error", res.error || "Error al guardar");
    }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden" className="max-w-4xl space-y-6">
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Configuraciones Globales</h2>
        <p className="text-sm text-zinc-500 mb-6">Administra el video de presentación, comisiones, billeteras y notificaciones.</p>
        
        <form onSubmit={handleSubmit} className="space-y-8">

          {/* =========================================================================
              SECCIÓN: VIDEO DE INICIO / PRESENTACIÓN DIARIA
              ========================================================================= */}
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">
                    Video de Presentación de Inicio
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Se muestra una sola vez al día por dispositivo, con pantalla de carga Roraima y transición fluida.
                  </p>
                </div>
              </div>

              {/* Interruptor Switch Activado/Desactivado */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  {introEnabled ? "Activado" : "Desactivado"}
                </span>
                <button
                  type="button"
                  onClick={() => setIntroEnabled(!introEnabled)}
                  className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 relative focus:outline-none ${
                    introEnabled ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                >
                  <motion.div
                    layout
                    className="w-6 h-6 rounded-full bg-white shadow-md"
                    animate={{ x: introEnabled ? 24 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            </div>

            {/* Barra de Herramientas de Prueba y Diagnóstico */}
            <div className="flex flex-wrap items-center gap-2 p-3 bg-zinc-50 dark:bg-zinc-950/60 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60">
              <button
                type="button"
                onClick={() => handleTestIntro()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Probar Video de Inicio Ahora</span>
              </button>
              <button
                type="button"
                onClick={handleResetDailyLimit}
                className="px-4 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Resetear Límite Diario en Este Equipo</span>
              </button>
            </div>

            {/* Barra de Progreso de Subida si está activa */}
            {uploadingTarget && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Subiendo video para {uploadingTarget === "desktop" ? "Escritorio" : "Dispositivos Móviles"}...
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-emerald-500/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Grid: Configuración Escritorio vs Móvil */}
            <div className="grid md:grid-cols-2 gap-6">
              
              {/* VIDEO DE ESCRITORIO */}
              <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Video para Escritorio (Desktop)
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Principal
                  </span>
                </div>

                <p className="text-xs text-zinc-500">
                  Recomendado: Video horizontal (16:9), formato MP4 en alta calidad (H.264).
                </p>

                {/* Previsualización del video desktop */}
                {desktopUrl && (
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-zinc-200 dark:border-zinc-800">
                    <video
                      key={desktopUrl}
                      src={desktopUrl}
                      controls
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
                    URL o Ruta del Video:
                  </label>
                  <input
                    type="text"
                    value={desktopUrl}
                    onChange={(e) => setDesktopUrl(e.target.value)}
                    placeholder="/videos/presentacion.mp4"
                    className="w-full font-mono text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-zinc-900 dark:text-zinc-100 outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <input
                    ref={desktopFileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadVideo(file, "desktop");
                      if (e.target) e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploadingTarget !== null}
                    onClick={() => desktopFileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Subir nuevo video para Escritorio (.mp4)</span>
                  </button>
                </div>
              </div>

              {/* VIDEO DE MÓVIL */}
              <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-indigo-500" />
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Video para Móviles (Smartphones)
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    Opcional
                  </span>
                </div>

                <p className="text-xs text-zinc-500">
                  Recomendado: Video vertical (9:16) o ligero. Si no se sube, los teléfonos usarán el de escritorio.
                </p>

                {/* Previsualización del video móvil */}
                {mobileUrl ? (
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-zinc-200 dark:border-zinc-800">
                    <video
                      key={mobileUrl}
                      src={mobileUrl}
                      controls
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="aspect-video rounded-xl bg-zinc-100 dark:bg-zinc-900/60 border border-dashed border-zinc-300 dark:border-zinc-800 flex flex-col items-center justify-center text-center p-4">
                    <Smartphone className="w-8 h-8 text-zinc-400 mb-2" />
                    <span className="text-xs font-semibold text-zinc-500">Sin video específico para móvil</span>
                    <span className="text-[11px] text-zinc-400">Se usará el video de escritorio por defecto</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
                    URL o Ruta del Video Móvil:
                  </label>
                  <input
                    type="text"
                    value={mobileUrl}
                    onChange={(e) => setMobileUrl(e.target.value)}
                    placeholder="Dejar vacío para usar el video de escritorio"
                    className="w-full font-mono text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <input
                    ref={mobileFileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadVideo(file, "mobile");
                      if (e.target) e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploadingTarget !== null}
                    onClick={() => mobileFileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Subir video vertical para Móvil (.mp4)</span>
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* =========================================================================
              SECCIÓN: IDENTIDAD VISUAL Y TEXTOS
              ========================================================================= */}
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
            <h3 className="font-bold text-lg mb-4 text-zinc-900 dark:text-zinc-50 flex items-center gap-2"><LayoutDashboard className="w-5 h-5 text-indigo-500" /> Identidad Visual y Textos</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Nombre de la App</label>
                <input type="text" name="appName" defaultValue={settings.appName} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">URL del Logo</label>
                <input type="text" name="logoUrl" defaultValue={settings.logoUrl} placeholder="/logo-transparent.png" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Título Principal (Hero)</label>
                <input type="text" name="heroTitle" defaultValue={settings.heroTitle} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Subtítulo (Hero)</label>
                <input type="text" name="heroSubtitle" defaultValue={settings.heroSubtitle} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
            </div>
          </div>

          {/* =========================================================================
              SECCIÓN: BILLETERA TRON
              ========================================================================= */}
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
            <h3 className="font-bold text-lg mb-4 text-zinc-900 dark:text-zinc-50 flex items-center gap-2"><Wallet className="w-5 h-5 text-indigo-500" /> Billetera TRON (USDT TRC20)</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Dirección Receptora de Depósitos</label>
                <input type="text" name="tronDepositAddress" defaultValue={settings.tronDepositAddress} placeholder="Empieza con T..." className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Hot Wallet de Retiros</label>
                <input type="text" name="tronHotWalletAddress" defaultValue={settings.tronHotWalletAddress} placeholder="Empieza con T..." className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">TronGrid API Key</label>
                <input type="text" name="trongridApiKey" defaultValue={settings.trongridApiKey} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
            </div>
          </div>

          {/* =========================================================================
              SECCIÓN: COMISIONES Y COSTOS
              ========================================================================= */}
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
            <h3 className="font-bold text-lg mb-4 text-zinc-900 dark:text-zinc-50 flex items-center gap-2"><Coins className="w-5 h-5 text-amber-500" /> Comisiones y Costos</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Comisión de Retiro (USDT)</label>
                <input type="number" step="0.01" name="withdrawFeeUsdt" defaultValue={settings.withdrawFeeUsdt} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Costo Membresía VIP (USDT)</label>
                <input type="number" step="0.01" name="vipMembershipUsdt" defaultValue={settings.vipMembershipUsdt} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Fee Anunciante (0.001 = 0.1%)</label>
                <input type="number" step="0.0001" name="makerFeeRate" defaultValue={settings.makerFeeRate} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
            </div>
          </div>

          {/* =========================================================================
              SECCIÓN: CORREO Y SOPORTE (SMTP)
              ========================================================================= */}
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
            <h3 className="font-bold text-lg mb-4 text-zinc-900 dark:text-zinc-50 flex items-center gap-2"><Headset className="w-5 h-5 text-sky-500" /> Correo y Soporte (SMTP)</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Correo de Contacto (Público)</label>
                <input type="email" name="supportEmail" defaultValue={settings.supportEmail} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">SMTP Host</label>
                <input type="text" name="smtpHost" defaultValue={settings.smtpHost} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">SMTP Port</label>
                <input type="number" name="smtpPort" defaultValue={settings.smtpPort} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">SMTP Usuario</label>
                <input type="text" name="smtpUser" defaultValue={settings.smtpUser} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">SMTP Contraseña</label>
                <input type="password" name="smtpPass" defaultValue={settings.smtpPass} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving || uploadingTarget !== null} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Guardar Configuraciones
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
