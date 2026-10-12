"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShieldCheck, MessageSquare, AlertTriangle, Users, Search, Filter, Loader2, ShieldX, X, Send, Bot, Headset,
  User as UserIcon, CheckCircle2, RotateCcw, LifeBuoy, Scale, UserCheck, ClipboardList, Gavel, LayoutDashboard,
  LogOut, RefreshCw,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getIdToken, waitForUser } from "@/lib/client-auth";
import { auth } from "@/lib/firebase";
import { getStaffSession, getMyProposals } from "@/app/actions/admin";
import { getSupportPanelData, getTicketThread, replyTicket, setTicketStatus } from "@/app/actions/support";
import { KycTab, TribunalTab, ProposalCard, containerVariants, itemVariants, type StaffMode } from "@/components/staff-tabs";

type PanelData = Extract<Awaited<ReturnType<typeof getSupportPanelData>>, { success: true }>;
type Ticket = PanelData["tickets"][number];
type Thread = Extract<Awaited<ReturnType<typeof getTicketThread>>, { success: true }>["ticket"];
type Proposal = Awaited<ReturnType<typeof getMyProposals>>["proposals"][number];
type Tab = "tickets" | "tribunal" | "kyc" | "proposals";

const TYPE_LABEL: Record<string, string> = {
  FRAUD: "FRAUDE/DISPUTA",
  DEPOSIT: "FONDOS",
  KYC: "VERIFICACIÓN",
  MERCHANT: "COMERCIANTE",
  GENERAL: "GENERAL",
};

const STATUS_LABEL: Record<string, string> = { OPEN: "ABIERTO", ANSWERED: "RESPONDIDO", CLOSED: "CERRADO" };

const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
};

export default function SupportPanelPage() {
  const router = useRouter();
  const [gate, setGate] = React.useState<"loading" | "denied" | "ok">("loading");
  const [staff, setStaff] = React.useState<{ name: string | null; email: string; role: StaffMode } | null>(null);
  const [tab, setTab] = React.useState<Tab>("tickets");
  const [toast, setToast] = React.useState<{ type: "error" | "success"; text: string } | null>(null);

  const showToast = React.useCallback((type: "error" | "success", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4500);
  }, []);

  // RBAC: el servidor confirma el rol (SUPPORT o ADMIN)
  React.useEffect(() => {
    (async () => {
      const user = await waitForUser();
      if (!user) return router.push("/auth");
      const res = await getStaffSession(await user.getIdToken());
      if (res.success) { setStaff(res.staff); setGate("ok"); }
      else setGate("denied");
    })();
  }, [router]);

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/auth");
  };

  if (gate === "loading") {
    return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-rose-500" /></div>;
  }

  if (gate === "denied" || !staff) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md text-center bg-white dark:bg-zinc-900 rounded-[2rem] p-10 border border-zinc-200/50 dark:border-zinc-800/50 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto mb-5"><ShieldX className="w-8 h-8 text-rose-500" /></div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Acceso restringido</h1>
          <p className="text-sm text-zinc-500 mb-6">Esta área es exclusiva para el equipo de Soporte de Roraima Exchange.</p>
          <button onClick={() => router.push("/dashboard")} className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-colors">Volver al panel</button>
        </motion.div>
      </div>
    );
  }

  const isAdmin = staff.role === "ADMIN";
  const initials = (staff.name || staff.email || "SP").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const tabs: { id: Tab; icon: typeof LifeBuoy; label: string }[] = [
    { id: "tickets", icon: MessageSquare, label: "Tickets" },
    { id: "tribunal", icon: Scale, label: "Disputas" },
    { id: "kyc", icon: UserCheck, label: "KYC" },
    ...(!isAdmin ? [{ id: "proposals" as Tab, icon: ClipboardList, label: "Mis propuestas" }] : []),
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

      {/* Barra superior del staff (con sesión) */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg shadow-rose-600/30">
            <LifeBuoy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-zinc-900 dark:text-zinc-50 leading-tight">Panel de Soporte</h1>
            <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Roraima Exchange · {isAdmin ? "Administrador" : "Agente de Soporte"}</span>
          </div>
        </div>

        <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-full p-1 overflow-x-auto max-w-full order-3 lg:order-none w-full lg:w-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`support-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                tab === t.id ? "bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              <t.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {isAdmin && (
            <Link href="/admin" title="Admin Center" className="p-2.5 rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"><Gavel className="w-5 h-5" /></Link>
          )}
          <Link href="/dashboard" title="Mi cuenta" className="p-2.5 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"><LayoutDashboard className="w-5 h-5" /></Link>
          <ThemeToggle />
          <div title={staff.email} className="hidden md:flex w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 items-center justify-center text-rose-700 dark:text-rose-300 font-bold border-2 border-rose-200 dark:border-rose-800">
            {initials}
          </div>
          <button onClick={handleLogout} title="Cerrar sesión" className="p-2.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"><LogOut className="w-5 h-5" /></button>
        </div>
      </div>

      {!isAdmin && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="flex gap-3 p-4 rounded-2xl bg-violet-500/5 border border-violet-500/20 text-sm text-violet-800 dark:text-violet-300">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span>Puedes responder y cerrar tickets y mediar en disputas. Los veredictos y las decisiones de KYC se envían como <b>propuestas</b> y solo se ejecutan cuando un administrador las aprueba.</span>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          {tab === "tickets" && <TicketsTab key="tickets" onOpenTab={setTab} />}
          {tab === "tribunal" && <TribunalTab key="tribunal" toast={showToast} mode={staff.role} />}
          {tab === "kyc" && <KycTab key="kyc" toast={showToast} mode={staff.role} />}
          {tab === "proposals" && <MyProposalsTab key="proposals" toast={showToast} />}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ============================================================================
//  MIS PROPUESTAS (rol SUPPORT)
// ============================================================================
function MyProposalsTab({ toast }: { toast: (type: "error" | "success", t: string) => void }) {
  const [rows, setRows] = React.useState<Proposal[] | null>(null);

  const load = React.useCallback(async () => {
    const res = await getMyProposals(await getIdToken());
    setRows(res.proposals);
    if (!res.success) toast("error", res.error);
  }, [toast]);

  React.useEffect(() => {
    load();
    const i = setInterval(load, 20000);
    return () => clearInterval(i);
  }, [load]);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden" className="space-y-6">
      <motion.div variants={itemVariants} className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Mis propuestas</h2>
          <p className="text-sm text-zinc-500">Estado de las decisiones que enviaste al administrador.</p>
        </div>
        <button onClick={load} className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-rose-500 transition-colors"><RefreshCw className="w-4 h-4 text-zinc-500" /></button>
      </motion.div>
      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-rose-500" /></div>
      ) : rows.length === 0 ? (
        <motion.div variants={itemVariants} className="text-center py-16 bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/50 dark:border-zinc-800/50 text-zinc-500">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-zinc-400" />
          Aún no has enviado propuestas.
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {rows.map((p) => <ProposalCard key={p.id} p={p} />)}
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
//  TICKETS
// ============================================================================
function TicketsTab({ onOpenTab }: { onOpenTab: (t: Tab) => void }) {
  const [data, setData] = React.useState<PanelData | null>(null);
  const [view, setView] = React.useState<"ACTIVE" | "CLOSED">("ACTIVE");
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("ALL");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await getSupportPanelData(await getIdToken(), view);
    if (res.success) { setData(res); setError(null); }
    else setError(res.error);
  }, [view]);

  React.useEffect(() => {
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [load]);

  const tickets = (data?.tickets ?? []).filter((t) => {
    const q = query.trim().toLowerCase();
    const matchesQ = !q || `${t.id} ${t.userEmail} ${t.userName ?? ""} ${t.subject}`.toLowerCase().includes(q);
    return matchesQ && (typeFilter === "ALL" || t.type === typeFilter);
  });
  const typeOrder = ["ALL", "FRAUD", "DEPOSIT", "KYC", "MERCHANT", "GENERAL"];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden">
        <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-3 tracking-tight">
              <ShieldCheck className="w-7 h-7 text-rose-500" />
              Tickets de Soporte
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Atiende las consultas de los usuarios. Las respuestas se envían al instante.</p>
          </div>
          
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input 
                id="support-search"
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar ticket ID o usuario..." 
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm focus:border-rose-500 outline-none transition-colors"
              />
            </div>
            <button
              id="support-filter"
              title={`Filtrar por tipo: ${typeFilter === "ALL" ? "todos" : TYPE_LABEL[typeFilter]}`}
              onClick={() => setTypeFilter((t) => typeOrder[(typeOrder.indexOf(t) + 1) % typeOrder.length])}
              className={`p-2 border rounded-xl transition-colors flex items-center gap-2 ${typeFilter !== "ALL" ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30" : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
            >
              <Filter className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              {typeFilter !== "ALL" && <span className="text-xs font-bold text-rose-600 dark:text-rose-400 pr-1">{TYPE_LABEL[typeFilter]}</span>}
            </button>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { title: "Tickets Abiertos", value: data?.stats.open, icon: MessageSquare, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30", tab: null },
            { title: "Disputas P2P", value: data?.stats.disputes, icon: AlertTriangle, color: "text-rose-500", bg: "bg-rose-100 dark:bg-rose-900/30", tab: "tribunal" as Tab },
            { title: "KYC Pendiente", value: data?.stats.pendingKyc, icon: Users, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/30", tab: "kyc" as Tab },
            { title: "Resueltos (Hoy)", value: data?.stats.resolvedToday, icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/30", tab: null },
          ].map((stat, i) => {
            const body = (
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm flex items-center gap-4 h-full text-left">
                <div className={`w-12 h-12 rounded-full ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{stat.title}</p>
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{stat.value ?? "—"}</p>
                </div>
              </div>
            );
            const t = stat.tab;
            return t ? <button key={i} type="button" onClick={() => onOpenTab(t)} className="hover:-translate-y-0.5 transition-transform">{body}</button> : <div key={i}>{body}</div>;
          })}
        </motion.div>

        <div className="flex gap-2 mb-4">
          {(["ACTIVE", "CLOSED"] as const).map((v) => (
            <button
              key={v}
              id={`support-view-${v.toLowerCase()}`}
              onClick={() => { setView(v); setData(null); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${view === v ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900" : "bg-white dark:bg-zinc-900 text-zinc-500 border border-zinc-200 dark:border-zinc-800"}`}
            >
              {v === "ACTIVE" ? "Activos" : "Cerrados"}
            </button>
          ))}
        </div>

        {error && <div className="mb-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-2xl p-4 text-sm">{error}</div>}

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
          {!data ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-rose-500" /></div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
              {view === "ACTIVE" ? "No hay tickets pendientes." : "No hay tickets cerrados."}
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-100 dark:border-zinc-800">
                <tr>
                  <th className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-50">Ticket ID</th>
                  <th className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-50">Usuario</th>
                  <th className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-50">Asunto / Razón</th>
                  <th className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-50">Tipo</th>
                  <th className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-50">Estado</th>
                  <th className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-50">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {tickets.map((ticket: Ticket) => {
                  const urgent = ticket.type === "FRAUD" && ticket.status === "OPEN";
                  return (
                  <tr key={ticket.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-zinc-500">#{ticket.id.slice(0, 8).toUpperCase()}<div className="text-[10px] font-sans text-zinc-400">{ago(ticket.updatedAt)}</div></td>
                    <td className="px-6 py-4 font-medium text-zinc-900 dark:text-zinc-50">{ticket.userName || ticket.userEmail}<div className="text-xs text-zinc-500 font-normal">{ticket.userEmail}</div></td>
                    <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300 max-w-xs"><div className="truncate">{ticket.subject}</div><div className="text-xs text-zinc-400 truncate">{ticket.lastMessage}</div></td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        ticket.type === 'FRAUD' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                        ticket.type === 'KYC' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {TYPE_LABEL[ticket.type] ?? ticket.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1.5 text-xs font-semibold ${
                        urgent ? 'text-rose-600 dark:text-rose-400' : ticket.status === 'OPEN' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${urgent ? 'bg-rose-600 animate-pulse' : ticket.status === 'OPEN' ? 'bg-amber-500' : 'bg-emerald-600'}`} />
                        {urgent ? "URGENTE" : STATUS_LABEL[ticket.status] ?? ticket.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button id={`support-attend-${ticket.id.slice(0, 8)}`} onClick={() => setSelectedId(ticket.id)} className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium">
                        {ticket.status === "CLOSED" ? "Ver" : "Atender"}
                      </button>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
          )}
        </div>

      <AnimatePresence>
        {selectedId && <TicketDrawer key={selectedId} ticketId={selectedId} onClose={() => { setSelectedId(null); load(); }} />}
      </AnimatePresence>
    </motion.div>
  );
}

function TicketDrawer({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const [thread, setThread] = React.useState<Thread | null>(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    const res = await getTicketThread(await getIdToken(), ticketId);
    if (res.success) setThread(res.ticket);
    else setErr(res.error);
  }, [ticketId]);

  React.useEffect(() => {
    load();
    const i = setInterval(load, 6000);
    return () => clearInterval(i);
  }, [load]);

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread?.messages.length]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const res = await replyTicket(await getIdToken(), ticketId, text);
    setBusy(false);
    if (res.success) { setText(""); load(); } else setErr(res.error);
  };

  const toggle = async (status: "OPEN" | "CLOSED") => {
    setBusy(true);
    const res = await setTicketStatus(await getIdToken(), ticketId, status);
    setBusy(false);
    if (res.success) { if (status === "CLOSED") onClose(); else load(); } else setErr(res.error);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl h-full bg-white dark:bg-zinc-900 shadow-2xl flex flex-col"
      >
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-xs text-zinc-400">#{ticketId.slice(0, 8).toUpperCase()}</div>
            <h2 className="font-bold text-lg text-zinc-900 dark:text-zinc-50 truncate">{thread?.subject ?? "Cargando..."}</h2>
            {thread && (
              <div className="text-xs text-zinc-500 mt-1">
                {thread.user.name || thread.user.email} · {thread.user.email} · KYC <span className={thread.user.kycStatus === "VERIFIED" ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}>{thread.user.kycStatus}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="w-5 h-5 text-zinc-500" /></button>
        </div>

        {thread && thread.trades.length > 0 && (
          <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-2">
            {thread.trades.map((t) => (
              <Link key={t.id} href={`/dashboard/p2p/trade/${t.id}`} target="_blank" className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${t.status === "DISPUTED" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
                Orden #{t.id.slice(0, 8).toUpperCase()} · {t.cryptoAmount} USDT · {t.status}
              </Link>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-zinc-50 dark:bg-zinc-950/40">
          {!thread ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-rose-500" /></div> : thread.messages.map((m) => {
            const staffSide = m.from === "me" || m.from === "agent";
            return (
              <div key={m.id} className={`flex flex-col ${staffSide ? "items-end" : "items-start"}`}>
                <span className="text-[10px] text-zinc-400 font-bold mb-1 mx-1 flex items-center gap-1">
                  {m.from === "bot" ? <Bot className="w-3 h-3" /> : staffSide ? <Headset className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                  {m.senderName} · {new Date(m.createdAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                  staffSide ? "bg-indigo-600 text-white rounded-tr-sm" : m.from === "bot" ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-200 rounded-tl-sm" : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border border-zinc-100 dark:border-zinc-700 rounded-tl-sm"
                }`}>{m.content}</div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {err && <p className="px-5 pt-2 text-xs text-rose-500">{err}</p>}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          {thread?.status !== "CLOSED" ? (
            <>
              {/* Respuestas rápidas dinámicas según el último mensaje */}
              <div className="flex flex-wrap gap-1.5 mb-1 no-scrollbar overflow-x-auto pb-1">
                {(() => {
                  const lastUserMsg = [...(thread?.messages || [])].reverse().find(m => m.from === "user" || m.from === "me");
                  const lower = (lastUserMsg?.content || "").toLowerCase();
                  const suggestions: {label: string, text: string}[] = [];
                  
                  if (lower.includes("identidad") || lower.includes("kyc") || lower.includes("verificar")) {
                    suggestions.push({ label: "¿Cómo verificar identidad?", text: "Para verificar tu identidad, dirígete a Seguridad > Verificación KYC y sube una foto clara de tu documento de identidad junto con una selfie." });
                    suggestions.push({ label: "Rechazo de KYC", text: "Tu verificación KYC fue rechazada porque la imagen no era clara o el documento está vencido. Por favor, intenta de nuevo." });
                  }
                  if (lower.includes("comerciante") || lower.includes("volumen") || lower.includes("opero con")) {
                    suggestions.push({ label: "Solicitud Recibida", text: "Hemos recibido tu solicitud para ser comerciante verificado. Estamos evaluando tu volumen y operaciones recientes. Te notificaremos pronto." });
                    suggestions.push({ label: "Requisitos", text: "Para ser comerciante necesitas: KYC verificado, al menos 20 órdenes completadas en 30 días, y una tasa de éxito superior al 90%." });
                  }
                  if (lower.includes("estafa") || lower.includes("disputa") || lower.includes("apelar") || lower.includes("pagó") || lower.includes("pague") || lower.includes("libera")) {
                    suggestions.push({ label: "Disputa escalada", text: "Tu caso ha sido escalado a mediación. Por favor, asegúrate de haber adjuntado el comprobante de pago en el chat de la orden." });
                    suggestions.push({ label: "Advertencia P2P", text: "Recordatorio: marcar una orden como pagada sin haber transferido los fondos puede resultar en la suspensión permanente de la cuenta." });
                  }
                  if (lower.includes("depósito") || lower.includes("retiro") || lower.includes("txid") || lower.includes("hash") || lower.includes("saldo") || lower.includes("llega")) {
                    suggestions.push({ label: "Solicitar TXID", text: "Por favor, indícanos el hash (TXID) de tu transacción para poder rastrear los fondos en la blockchain." });
                    suggestions.push({ label: "Demora de Red", text: "Los depósitos dependen de las confirmaciones de la red. Por favor, espera unos minutos más a que se procese." });
                  }
                  if (lower.includes("gracias") || lower.includes("listo") || lower.includes("ok") || lower.includes("entendido")) {
                    suggestions.push({ label: "De nada", text: "¡De nada! ¿Hay algo más en lo que pueda ayudarte hoy?" });
                    suggestions.push({ label: "Despedida", text: "¡Estamos a tu orden! Procederé a cerrar el ticket. Que tengas un buen día." });
                  }
                  if (suggestions.length === 0) {
                    suggestions.push({ label: "Pedir más detalles", text: "Por favor, bríndanos más detalles sobre tu consulta para poder ayudarte de la mejor manera." });
                    suggestions.push({ label: "En revisión", text: "Estamos revisando tu caso. Te daremos una respuesta a la brevedad posible." });
                  }
                  
                  return suggestions.slice(0, 4).map((s, idx) => (
                    <button key={idx} onClick={() => setText(s.text)} className="shrink-0 text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
                      {s.label}
                    </button>
                  ));
                })()}
              </div>
              <div className="flex gap-2">
                <input
                  id="support-reply-input"
                  value={text}
                  maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && send()}
                  placeholder="Responder al usuario..."
                  className="flex-1 bg-zinc-100 dark:bg-zinc-950 border border-transparent focus:border-indigo-500 rounded-full px-5 py-3 text-sm outline-none"
                />
                <button id="support-reply-send" onClick={send} disabled={busy || !text.trim()} className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white flex items-center justify-center"><Send className="w-4 h-4" /></button>
              </div>
              <button id="support-ticket-close" onClick={() => toggle("CLOSED")} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Marcar como resuelto
              </button>
            </>
          ) : (
            <button id="support-ticket-reopen" onClick={() => toggle("OPEN")} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" /> Reabrir ticket
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
