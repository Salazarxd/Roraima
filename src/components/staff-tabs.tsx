"use client";

import * as React from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  Search, Scale, CheckCircle2, XCircle, FileCheck, MessageSquare, Loader2, Lock, Unlock, Gavel, Send,
  FileText, AlertTriangle, RefreshCw, Clock, ArrowLeft, Eye, X, Hourglass, UserCheck,
} from "lucide-react";
import { getIdToken } from "@/lib/client-auth";
import { useRealtime } from "@/lib/use-realtime";
import {
  getDisputedTrades, getDisputeMessages, sendMediatorMessage, resolveDispute,
  getKycQueue, setKycStatus, getKycDocuments, proposeDecision, type getProposals,
} from "@/app/actions/admin";

/**
 * Pestañas compartidas por el Admin Center y el Panel de Soporte.
 *  - mode="ADMIN":   ejecuta veredictos y decisiones KYC directamente.
 *  - mode="SUPPORT": solo PROPONE; la decisión queda pendiente hasta que un administrador la apruebe.
 * La autorización real la impone el servidor; el modo solo adapta la interfaz.
 */

export type StaffMode = "ADMIN" | "SUPPORT";
export type ToastFn = (type: "error" | "success", t: string) => void;

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

type Dispute = Awaited<ReturnType<typeof getDisputedTrades>>["trades"][number];
type Msg = Awaited<ReturnType<typeof getDisputeMessages>>["messages"][number];
type KycUser = Awaited<ReturnType<typeof getKycQueue>>["users"][number];
type KycDoc = Awaited<ReturnType<typeof getKycDocuments>>["documents"][number];
type Pending = NonNullable<Dispute["pendingProposal"]>;

export const fmt = (n: number, d = 2) => n.toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d });
export const ago = (iso: string | null) => {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
};

const DECISION_TEXT: Record<string, string> = {
  RELEASE_TO_BUYER: "Liberar USDT al comprador",
  REFUND_TO_SELLER: "Devolver USDT al vendedor",
  VERIFIED: "Aprobar KYC",
  REJECTED: "Rechazar KYC",
};

/** Aviso de propuesta pendiente de aprobación. */
function PendingBadge({ p, mode, compact }: { p: Pending; mode: StaffMode; compact?: boolean }) {
  if (compact) {
    return (
      <span title={`${DECISION_TEXT[p.decision] ?? p.decision} · propuesto por ${p.proposer}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
        <Hourglass className="w-3 h-3" /> Propuesta pendiente
      </span>
    );
  }
  return (
    <div className="flex gap-3 p-4 rounded-2xl bg-violet-500/5 border border-violet-500/20 text-sm">
      <Hourglass className="w-5 h-5 shrink-0 text-violet-500" />
      <div className="min-w-0">
        <div className="font-bold text-violet-700 dark:text-violet-300">
          Propuesta pendiente de aprobación: {DECISION_TEXT[p.decision] ?? p.decision}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">Por {p.proposer} · {ago(p.createdAt)}</div>
        <p className="text-zinc-700 dark:text-zinc-300 mt-1.5 whitespace-pre-wrap break-words">{p.note}</p>
        {mode === "ADMIN" && <p className="text-xs text-violet-600 dark:text-violet-400 mt-2 font-semibold">Apruébala o recházala en la pestaña «Aprobaciones», o resuelve directamente.</p>}
      </div>
    </div>
  );
}

// ============================================================================
//  KYC
// ============================================================================

const OCR_META = {
  MATCH: { label: "OCR: la cédula de la foto coincide", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  MISMATCH: { label: "OCR: la foto NO muestra la cédula declarada", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  UNREADABLE: { label: "OCR: no se pudo leer, revisar a mano", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
} as const;

function OcrBadge({ status }: { status: keyof typeof OCR_META | null }) {
  if (!status) return null;
  const m = OCR_META[status];
  return <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${m.cls}`}>{m.label}</span>;
}

export function KycTab({ toast, mode }: { toast: ToastFn; mode: StaffMode }) {
  const [users, setUsers] = React.useState<KycUser[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [docsFor, setDocsFor] = React.useState<KycUser | null>(null);
  const [docs, setDocs] = React.useState<KycDoc[] | null>(null);
  const [proposal, setProposal] = React.useState<{ u: KycUser; decision: "VERIFIED" | "REJECTED" } | null>(null);
  const [note, setNote] = React.useState("");
  const isAdmin = mode === "ADMIN";

  const openDocs = async (u: KycUser) => {
    setDocsFor(u);
    setDocs(null);
    const res = await getKycDocuments(await getIdToken(), u.id);
    setDocs(res.documents);
    if (!res.success) toast("error", res.error);
  };

  const load = React.useCallback(async () => {
    const res = await getKycQueue(await getIdToken());
    setUsers(res.users);
    if (!res.success) toast("error", res.error);
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  const act = async (u: KycUser, status: "VERIFIED" | "REJECTED") => {
    if (!isAdmin) {
      setNote("");
      setProposal({ u, decision: status });
      return;
    }
    setBusyId(u.id);
    const res = await setKycStatus(await getIdToken(), u.id, status);
    if (res.success) toast("success", status === "VERIFIED" ? "KYC aprobado" : "KYC rechazado");
    else toast("error", res.error);
    setBusyId(null);
    load();
  };

  const submitProposal = async () => {
    if (!proposal) return;
    setBusyId(proposal.u.id);
    const res = await proposeDecision(await getIdToken(), { kind: "KYC", targetId: proposal.u.id, decision: proposal.decision, note });
    setBusyId(null);
    if (res.success) {
      toast("success", "Propuesta enviada. Un administrador debe aprobarla.");
      setProposal(null);
      setNote("");
      load();
    } else toast("error", res.error);
  };

  const filtered = (users ?? []).filter((u) => `${u.name} ${u.email} ${u.document ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden" className="space-y-6">
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Verificaciones KYC</h2>
          <p className="text-sm text-zinc-500">
            {isAdmin
              ? "Usuarios pendientes de revisión. Verifica que el nombre coincida con el documento."
              : "Revisa los documentos y envía tu recomendación. La decisión final la toma un administrador."}
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input id="kyc-search" value={query} onChange={(e) => setQuery(e.target.value)} type="text" placeholder="Buscar usuario..." className="pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden">
        {users === null ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
            No hay verificaciones pendientes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-200 dark:border-zinc-800">
                  {["Usuario", "Documento", "Enviado", "Estado", ""].map((h) => (
                    <th key={h} className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {filtered.map((u) => {
                  const locked = !isAdmin && !!u.pendingProposal;
                  return (
                    <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-50">{u.name}</div>
                        <div className="text-xs text-zinc-500">{u.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2"><FileCheck className="w-4 h-4 text-indigo-500" /><span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{u.document || "—"}</span></div>
                        {u.documentType && <div className="text-[11px] text-zinc-500 mt-0.5">{u.documentType}</div>}
                        <OcrBadge status={u.ocrStatus} />
                        <button id={`kyc-docs-${u.id.slice(0, 8)}`} onClick={() => openDocs(u)} disabled={!u.documents} className="mt-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:text-zinc-400 disabled:no-underline flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" /> {u.documents ? `Ver ${u.documents} archivo(s)` : "Sin archivos"}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">{ago(u.submittedAt)}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${u.kycStatus === "PENDING" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"}`}>
                            {u.kycStatus === "PENDING" ? "Pendiente" : "Rechazado"}
                          </span>
                          {u.pendingProposal && <PendingBadge p={u.pendingProposal} mode={mode} compact />}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button disabled={busyId === u.id || locked} onClick={() => act(u, "VERIFIED")} title={isAdmin ? "Aprobar" : "Proponer aprobación"} className="p-2 rounded-xl bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 disabled:opacity-50 transition-colors"><CheckCircle2 className="w-5 h-5" /></button>
                          <button disabled={busyId === u.id || u.kycStatus === "REJECTED" || locked} onClick={() => act(u, "REJECTED")} title={isAdmin ? "Rechazar" : "Proponer rechazo"} className="p-2 rounded-xl bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400 disabled:opacity-50 transition-colors"><XCircle className="w-5 h-5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Visor de documentos */}
      <AnimatePresence>
        {docsFor && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDocsFor(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl border border-zinc-100 dark:border-zinc-800">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{docsFor.name}</h3>
                  <p className="text-sm text-zinc-500">{docsFor.email} · {docsFor.documentType ?? "Documento"} declarado: <b>{docsFor.document || "—"}</b></p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Verifica que el número de cédula de la foto sea exactamente {docsFor.document || "—"} y que el rostro coincida con la selfie.</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <OcrBadge status={docsFor.ocrStatus} />
                    {docsFor.ocrNumbers && <span className="text-xs text-zinc-500">Números leídos en la foto: <b className="font-mono text-zinc-700 dark:text-zinc-300">{docsFor.ocrNumbers}</b></span>}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">Tel: {docsFor.phone || "—"} · Dirección: {docsFor.address || "—"}</p>
                </div>
                <button onClick={() => setDocsFor(null)} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="w-5 h-5 text-zinc-500" /></button>
              </div>
              {docsFor.pendingProposal && <div className="mb-5"><PendingBadge p={docsFor.pendingProposal} mode={mode} /></div>}
              {docs === null ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
              ) : docs.length === 0 ? (
                <p className="text-center py-16 text-zinc-500">No se encontraron archivos.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {docs.map((d) => (
                    <div key={d.kind} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                      <div className="px-3 py-2 text-xs font-bold text-zinc-500 bg-zinc-50 dark:bg-zinc-950/50">
                        {d.kind === "FRONT" ? "Documento (frente)" : d.kind === "BACK" ? "Documento (reverso)" : "Selfie con documento"}
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <a href={d.dataUrl} target="_blank" rel="noopener noreferrer"><img src={d.dataUrl} alt={d.kind} className="w-full h-56 object-contain bg-zinc-100 dark:bg-zinc-950" /></a>
                    </div>
                  ))}
                </div>
              )}
              {(isAdmin || !docsFor.pendingProposal) && (
                <div className="flex gap-3 mt-6">
                  <button disabled={busyId === docsFor.id || docsFor.kycStatus === "REJECTED"} onClick={() => { const u = docsFor; setDocsFor(null); act(u, "REJECTED"); }} className="flex-1 py-3 rounded-2xl font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 disabled:opacity-40 transition-colors">
                    {isAdmin ? "Rechazar" : "Proponer rechazo"}
                  </button>
                  <button disabled={busyId === docsFor.id} onClick={() => { const u = docsFor; setDocsFor(null); act(u, "VERIFIED"); }} className="flex-[1.4] py-3 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition-colors">
                    {isAdmin ? "Aprobar KYC" : "Proponer aprobación"}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Propuesta (rol SUPPORT) */}
      <AnimatePresence>
        {proposal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busyId && setProposal(null)}>
            <motion.div initial={{ scale: 0.92, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl border border-zinc-100 dark:border-zinc-800">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${proposal.decision === "VERIFIED" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}><UserCheck className="w-7 h-7" /></div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">{proposal.decision === "VERIFIED" ? "Proponer aprobación de KYC" : "Proponer rechazo de KYC"}</h3>
              <p className="text-sm text-zinc-500 mb-4">Usuario: <b>{proposal.u.name}</b> ({proposal.u.email}). Tu propuesta se enviará al administrador; el estado del usuario no cambia hasta que la apruebe.</p>
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">Justificación para el administrador</label>
              <textarea id="kyc-proposal-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000} placeholder="Ej: El nombre y la cédula coinciden con el documento; la selfie corresponde al titular." className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 resize-none mb-1" />
              <div className="text-[11px] text-zinc-400 text-right mb-5">{note.trim().length} · mínimo 10</div>
              <div className="flex gap-3">
                <button onClick={() => setProposal(null)} disabled={!!busyId} className="flex-1 py-3 rounded-2xl font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Volver</button>
                <button id="kyc-proposal-submit" onClick={submitProposal} disabled={!!busyId || note.trim().length < 10} className="flex-[1.4] py-3 rounded-2xl font-bold text-white bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-600/20 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                  {busyId && <Loader2 className="w-4 h-4 animate-spin" />} Enviar al administrador
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
//  TRIBUNAL DE DISPUTAS
// ============================================================================
export function TribunalTab({ toast, mode }: { toast: ToastFn; mode: StaffMode }) {
  const [disputes, setDisputes] = React.useState<Dispute[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [mediatorText, setMediatorText] = React.useState("");
  const [verdict, setVerdict] = React.useState<null | "RELEASE_TO_BUYER" | "REFUND_TO_SELLER">(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const isAdmin = mode === "ADMIN";

  const loadDisputes = React.useCallback(async () => {
    const res = await getDisputedTrades(await getIdToken());
    setDisputes(res.trades);
    if (!res.success) toast("error", res.error);
    setSelectedId((cur) => (cur && res.trades.some((t) => t.id === cur) ? cur : res.trades[0]?.id ?? null));
  }, [toast]);

  const loadMessages = React.useCallback(async (id: string) => {
    const res = await getDisputeMessages(await getIdToken(), id);
    setMessages(res.messages);
  }, []);

  React.useEffect(() => {
    loadDisputes();
    const i = setInterval(loadDisputes, 15000);
    return () => clearInterval(i);
  }, [loadDisputes]);

  // Tiempo real sobre la orden seleccionada (el sondeo queda de respaldo)
  const chatLive = useRealtime({ tradeId: selectedId ?? undefined, enabled: !!selectedId }, (e) => {
    if (!selectedId) return;
    loadMessages(selectedId);
    if (e.kind === "RESOLVED" || e.kind === "RELEASED" || e.kind === "CANCELLED") loadDisputes();
  });

  React.useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);
    const i = setInterval(() => loadMessages(selectedId), chatLive ? 20000 : 5000);
    return () => clearInterval(i);
  }, [selectedId, loadMessages, chatLive]);

  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const selected = disputes?.find((d) => d.id === selectedId) ?? null;
  const verdictLocked = !isAdmin && !!selected?.pendingProposal;

  const sendMediator = async () => {
    if (!selected || !mediatorText.trim()) return;
    const text = mediatorText;
    setMediatorText("");
    const res = await sendMediatorMessage(await getIdToken(), selected.id, text);
    if (!res.success) {
      toast("error", res.error);
      setMediatorText(text);
    }
    loadMessages(selected.id);
  };

  const submitVerdict = async () => {
    if (!selected || !verdict) return;
    setBusy(true);
    const token = await getIdToken();
    const res = isAdmin
      ? await resolveDispute(token, selected.id, verdict, note)
      : await proposeDecision(token, { kind: "DISPUTE", targetId: selected.id, decision: verdict, note });
    setBusy(false);
    if (res.success) {
      toast(
        "success",
        !isAdmin
          ? "Recomendación enviada. Un administrador debe aprobarla."
          : verdict === "RELEASE_TO_BUYER" ? "USDT liberados al comprador" : "USDT devueltos al vendedor"
      );
      setVerdict(null);
      setNote("");
      loadDisputes();
      loadMessages(selected.id);
    } else toast("error", res.error);
  };

  if (disputes === null) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  if (disputes.length === 0) {
    return (
      <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden" className="text-center py-24">
        <motion.div variants={itemVariants} className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-5"><Scale className="w-10 h-10 text-emerald-500" /></motion.div>
        <motion.h2 variants={itemVariants} className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Sin disputas abiertas</motion.h2>
        <motion.p variants={itemVariants} className="text-zinc-500 mt-1">Todas las órdenes P2P se están resolviendo sin intervención.</motion.p>
        <motion.button variants={itemVariants} onClick={loadDisputes} className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-semibold hover:border-indigo-500 transition-colors"><RefreshCw className="w-4 h-4" /> Actualizar</motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden" className="flex flex-col gap-6">
      <motion.div variants={itemVariants} className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Tribunal de Disputas</h2>
          <p className="text-sm text-zinc-500">{disputes.length} caso(s) en cola · los más antiguos primero</p>
        </div>
        <button onClick={loadDisputes} className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 transition-colors"><RefreshCw className="w-4 h-4 text-zinc-500" /></button>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Cola de casos */}
        <motion.div variants={itemVariants} className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
          {disputes.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`shrink-0 w-64 lg:w-full text-left p-4 rounded-2xl border transition-all ${
                d.id === selectedId ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/30" : "bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-400"
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className={`font-mono text-xs font-bold ${d.id === selectedId ? "text-indigo-100" : "text-zinc-400"}`}>#{d.id.slice(-8).toUpperCase()}</span>
                <span className={`text-[10px] font-bold flex items-center gap-1 ${d.id === selectedId ? "text-indigo-100" : "text-rose-500"}`}><Clock className="w-3 h-3" /> {ago(d.disputedAt)}</span>
              </div>
              <div className={`font-black text-lg ${d.id === selectedId ? "" : "text-zinc-900 dark:text-zinc-50"}`}>{fmt(d.cryptoAmount)} USDT</div>
              <div className={`text-xs ${d.id === selectedId ? "text-indigo-100" : "text-zinc-500"}`}>
                Apela: {d.disputedByRole === "BUYER" ? "Comprador" : "Vendedor"}{d.wasCancelled ? " · tras cancelación" : ""}
              </div>
              {d.pendingProposal && (
                <div className={`mt-2 text-[10px] font-bold flex items-center gap-1 ${d.id === selectedId ? "text-violet-100" : "text-violet-600 dark:text-violet-400"}`}>
                  <Hourglass className="w-3 h-3" /> Propuesta pendiente
                </div>
              )}
            </button>
          ))}
        </motion.div>

        {selected && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-w-0">
            {/* Expediente */}
            <motion.div key={selected.id + "-info"} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-5">
              <div className={`rounded-[2rem] p-6 shadow-lg text-white ${selected.escrowHeld ? "bg-gradient-to-br from-indigo-600 to-violet-700 shadow-indigo-600/20" : "bg-gradient-to-br from-rose-600 to-orange-600 shadow-rose-600/20"}`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-white/70 text-sm font-medium">{selected.escrowHeld ? "Escrow retenido" : "Escrow NO retenido"}</span>
                    <div className="text-3xl font-black mt-1">{fmt(selected.cryptoAmount)} USDT</div>
                    <div className="text-sm text-white/70 mt-1">{fmt(selected.fiatAmount)} VES @ {fmt(selected.price, 3)}</div>
                  </div>
                  {selected.escrowHeld ? <Lock className="w-8 h-8 text-white/50" /> : <AlertTriangle className="w-8 h-8 text-white/70" />}
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-white/80">
                  <div><div className="text-white/50">Creada</div>{ago(selected.createdAt)}</div>
                  <div><div className="text-white/50">Pago marcado</div>{selected.paidAt ? ago(selected.paidAt) : "Nunca"}</div>
                  <div><div className="text-white/50">Disputa</div>{ago(selected.disputedAt)}</div>
                </div>
                {!selected.escrowHeld && <p className="text-xs mt-3 bg-black/20 rounded-lg p-2">El vendedor no tenía saldo para re-congelar. No se puede liberar automáticamente al comprador.</p>}
              </div>

              {selected.pendingProposal && <PendingBadge p={selected.pendingProposal} mode={mode} />}

              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-1">Motivo de la apelación ({selected.disputedByRole === "BUYER" ? "comprador" : "vendedor"})</div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{selected.disputeReason || "Sin motivo registrado"}</p>
              </div>

              {!selected.paidAt && (
                <div className="flex gap-3 p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 text-sm text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-5 h-5 shrink-0" /> El comprador nunca marcó la orden como pagada antes de la cancelación. Exija comprobante con referencia bancaria verificable.
                </div>
              )}

              {[{ label: "Comprador", p: selected.buyer, tag: "Paga VES" }, { label: "Vendedor", p: selected.seller, tag: "Entrega USDT" }].map(({ label, p, tag }) => (
                <div key={label} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-5 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
                  <div className="flex justify-between items-center mb-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-50">{label}</h3>
                    <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs rounded-lg font-bold">{tag}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-zinc-500">Nombre</span><span className="font-medium text-zinc-900 dark:text-zinc-50">{p.name}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Email</span><span className="font-medium text-zinc-900 dark:text-zinc-50 truncate ml-4">{p.email}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">KYC</span><span className={`font-bold ${p.kycStatus === "VERIFIED" ? "text-emerald-500" : "text-amber-500"}`}>{p.kycStatus}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Miembro</span><span className="font-medium text-zinc-900 dark:text-zinc-50">{ago(p.memberSince)}</span></div>
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      <div className="text-center rounded-xl bg-emerald-500/10 py-2"><div className="font-black text-emerald-600">{p.completed}</div><div className="text-[10px] text-zinc-500">Completadas</div></div>
                      <div className="text-center rounded-xl bg-rose-500/10 py-2"><div className="font-black text-rose-600">{p.disputes}</div><div className="text-[10px] text-zinc-500">Disputas</div></div>
                      <div className="text-center rounded-xl bg-zinc-500/10 py-2"><div className="font-black text-zinc-600 dark:text-zinc-300">{p.cancelled}</div><div className="text-[10px] text-zinc-500">Canceladas</div></div>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Chat + Veredicto */}
            <motion.div key={selected.id + "-chat"} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4">
              <div className="flex flex-col h-[520px] bg-zinc-100 dark:bg-zinc-950/50 rounded-[2rem] border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden shadow-inner">
                <div className="p-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-indigo-500" /><h3 className="font-bold text-zinc-900 dark:text-zinc-50">Expediente (Chat)</h3></div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">Inalterable</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((m) => <EvidenceMessage key={m.id} m={m} />)}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 border-t border-zinc-200/50 dark:border-zinc-800/50 bg-white dark:bg-zinc-900 flex gap-2">
                  <input
                    id="mediator-input"
                    value={mediatorText}
                    onChange={(e) => setMediatorText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMediator()}
                    placeholder="Escribir como Mediador (visible para ambas partes)..."
                    className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-full px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
                  />
                  <button id="mediator-send" onClick={sendMediator} disabled={!mediatorText.trim()} className="p-2.5 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition-colors"><Send className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-5 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-50 mb-1 text-center flex items-center justify-center gap-2">
                  <Gavel className="w-5 h-5 text-indigo-500" /> {isAdmin ? "Resolución Administrativa" : "Recomendación al Administrador"}
                </h3>
                <p className="text-[11px] text-zinc-500 text-center mb-4">
                  {isAdmin ? "Tu veredicto se ejecuta de inmediato y es irreversible." : verdictLocked ? "Ya enviaste una recomendación; espera la decisión del administrador." : "No mueve fondos: el administrador revisa y aprueba o rechaza tu propuesta."}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button id="verdict-buyer-btn" disabled={!selected.escrowHeld || verdictLocked} onClick={() => setVerdict("RELEASE_TO_BUYER")} className="py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col items-center gap-1">
                    <Unlock className="w-5 h-5" />
                    <span className="text-sm">A favor del Comprador</span>
                    <span className="text-[10px] opacity-80 uppercase tracking-wide">{isAdmin ? "Liberar USDT" : "Proponer liberar"}</span>
                  </button>
                  <button id="verdict-seller-btn" disabled={verdictLocked} onClick={() => setVerdict("REFUND_TO_SELLER")} className="py-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-rose-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col items-center gap-1">
                    <ArrowLeft className="w-5 h-5" />
                    <span className="text-sm">A favor del Vendedor</span>
                    <span className="text-[10px] opacity-80 uppercase tracking-wide">{isAdmin ? "Devolver USDT" : "Proponer devolver"}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* Modal de veredicto / propuesta */}
      <AnimatePresence>
        {verdict && selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busy && setVerdict(null)}>
            <motion.div
              initial={{ scale: 0.92, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl border border-zinc-100 dark:border-zinc-800"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${verdict === "RELEASE_TO_BUYER" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}><Gavel className="w-7 h-7" /></div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">{isAdmin ? "Confirmar veredicto" : "Enviar recomendación"}</h3>
              <p className="text-sm text-zinc-500 mb-4">
                {isAdmin
                  ? verdict === "RELEASE_TO_BUYER"
                    ? <>Se acreditarán <b>{fmt(selected.cryptoAmount)} USDT</b> a <b>{selected.buyer.name}</b>. Acción irreversible.</>
                    : <>Se devolverán <b>{fmt(selected.cryptoAmount)} USDT</b> a <b>{selected.seller.name}</b>. Acción irreversible.</>
                  : <>Propones <b>{DECISION_TEXT[verdict]}</b> ({fmt(selected.cryptoAmount)} USDT). No se moverán fondos hasta que un administrador lo apruebe.</>}
              </p>
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">{isAdmin ? "Justificación (visible para las partes)" : "Justificación para el administrador"}</label>
              <textarea
                id="verdict-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Ej: Se verificó la referencia bancaria 001234 por 380 VES en el estado de cuenta del vendedor."
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 resize-none mb-1"
              />
              <div className="text-[11px] text-zinc-400 text-right mb-5">{note.trim().length} · mínimo 10</div>
              <div className="flex gap-3">
                <button onClick={() => setVerdict(null)} disabled={busy} className="flex-1 py-3 rounded-2xl font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Volver</button>
                <button
                  id="verdict-confirm-btn"
                  onClick={submitVerdict}
                  disabled={busy || note.trim().length < 10}
                  className={`flex-[1.4] py-3 rounded-2xl font-bold text-white shadow-lg disabled:opacity-40 transition-all flex items-center justify-center gap-2 ${
                    !isAdmin ? "bg-violet-600 hover:bg-violet-700" : verdict === "RELEASE_TO_BUYER" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} {isAdmin ? "Emitir veredicto" : "Enviar al administrador"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function EvidenceMessage({ m }: { m: Msg }) {
  const time = new Date(m.createdAt).toLocaleString("es-VE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });

  if (m.senderRole === "SYSTEM") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[95%] text-[11px] bg-white/70 dark:bg-zinc-900/70 text-zinc-600 dark:text-zinc-400 font-medium px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-center">
          <span className="font-bold text-indigo-500">{time} · </span>{m.content.replace(/^\[SISTEMA\]\s*/, "")}
        </div>
      </div>
    );
  }

  const roleLabel = m.senderRole === "BUYER" ? "Comprador" : m.senderRole === "SELLER" ? "Vendedor" : "Mediador";
  const alignRight = m.senderRole === "BUYER";
  let body: React.ReactNode = <span className="whitespace-pre-wrap break-words">{m.content}</span>;
  if (m.content.startsWith("[ATTACHMENT:")) {
    const inner = m.content.slice(12, -1);
    const sep = inner.indexOf(":", inner.indexOf("/uploads/"));
    const url = sep > -1 ? inner.slice(0, sep) : inner;
    const name = sep > -1 ? inner.slice(sep + 1) : "archivo";
    if (!url.startsWith("/uploads/")) body = <span className="italic opacity-70">Adjunto externo bloqueado</span>;
    else if (/\.(png|jpe?g|webp)$/i.test(url)) {
      // eslint-disable-next-line @next/next/no-img-element
      body = <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={name} className="max-h-56 rounded-lg" /></a>;
    } else body = <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline"><FileText className="w-4 h-4" />{name}</a>;
  }

  return (
    <div className={`flex flex-col max-w-[85%] ${alignRight ? "items-end ml-auto" : "items-start"}`}>
      <span className="text-[10px] text-zinc-400 font-bold mb-1 mx-1">{m.senderName} ({roleLabel}) · {time}</span>
      <div className={`px-4 py-3 rounded-2xl text-sm shadow-sm ${
        m.senderRole === "STAFF" ? "bg-indigo-600 text-white" :
        alignRight ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 rounded-tr-sm" :
        "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 border border-zinc-100 dark:border-zinc-700 rounded-tl-sm"
      }`}>{body}</div>
    </div>
  );
}

// ============================================================================
//  PROPUESTAS (tarjeta compartida)
// ============================================================================
type Proposal = Awaited<ReturnType<typeof getProposals>>["proposals"][number];

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pendiente", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  APPROVED: { label: "Aprobada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  REJECTED: { label: "Rechazada", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  SUPERSEDED: { label: "Superada", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
};

export function ProposalCard({ p, actions }: { p: Proposal; actions?: React.ReactNode }) {
  const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.SUPERSEDED;
  const positive = p.decision === "RELEASE_TO_BUYER" || p.decision === "VERIFIED";
  return (
    <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-5 sm:p-6 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${p.kind === "DISPUTE" ? "bg-indigo-500/10 text-indigo-500" : "bg-amber-500/10 text-amber-500"}`}>
            {p.kind === "DISPUTE" ? <Scale className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">{p.kind === "DISPUTE" ? "Disputa P2P" : "Verificación KYC"}</div>
            <div className="font-bold text-zinc-900 dark:text-zinc-50 truncate">{p.target.label}</div>
            <div className="text-xs text-zinc-500 truncate">{p.target.detail}</div>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${st.cls}`}>{st.label}</span>
      </div>
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold mb-3 ${positive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
        {positive ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />} {p.decisionLabel}
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words bg-zinc-50 dark:bg-zinc-950/50 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800">{p.note}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-zinc-500">
        <span>Propuesto por <b className="text-zinc-700 dark:text-zinc-300">{p.proposer}</b> · {ago(p.createdAt)}</span>
        {p.reviewer && <span>Revisado por <b className="text-zinc-700 dark:text-zinc-300">{p.reviewer}</b> · {ago(p.reviewedAt)}</span>}
      </div>
      {p.reviewNote && <p className="text-xs text-zinc-500 mt-2 italic">Nota de revisión: {p.reviewNote}</p>}
      {actions}
    </motion.div>
  );
}
