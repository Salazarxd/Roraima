"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy, Check, Clock, MessageSquare, CheckCircle2, ShieldAlert, ArrowLeft, Paperclip, FileText,
  Loader2, Scale, XCircle, Lock, Unlock, AlertTriangle, Gavel, Send, BadgeCheck, Hourglass, ThumbsUp, ThumbsDown
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import {
  getTradeDetails, sendChatMessage, markTradeAsPaid, cancelTrade, releaseTrade, disputeTrade, uploadAttachment,
} from "@/app/actions/p2p";
import { getIdToken, waitForUser } from "@/lib/client-auth";
import { leaveFeedback } from "@/app/actions/feedback";
import { useRealtime } from "@/lib/use-realtime";
import { DigitalReceiptModal, type ReceiptData } from "@/components/digital-receipt-modal";
import { hapticTap, hapticSuccess, hapticMessage } from "@/lib/haptics";
import { playChimeSound, playCopySound, playSuccessSound } from "@/lib/audio-alerts";

type Trade = NonNullable<Awaited<ReturnType<typeof getTradeDetails>>> & { twoFactorEnabled?: boolean; hasFeedback?: boolean };
type ModalKind = null | "PAID" | "CANCEL" | "RELEASE" | "DISPUTE" | "FEEDBACK";

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING_PAYMENT: { label: "Esperando pago", color: "text-amber-500 bg-amber-500/10 border-amber-500/30", icon: Clock },
  PAID: { label: "Pago notificado · Esperando liberación", color: "text-sky-500 bg-sky-500/10 border-sky-500/30", icon: Hourglass },
  DISPUTED: { label: "En mediación", color: "text-rose-500 bg-rose-500/10 border-rose-500/30", icon: Scale },
  CANCELLED: { label: "Cancelada", color: "text-zinc-500 bg-zinc-500/10 border-zinc-500/30", icon: XCircle },
  COMPLETED: { label: "Completada", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
};

const fmt = (n: number, d = 2) => n.toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d });
const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

export default function TradeRoom() {
  const router = useRouter();
  const params = useParams<{ tradeId: string }>();
  const tradeId = params?.tradeId ?? "";

  const [trade, setTrade] = React.useState<Trade | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [myUid, setMyUid] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [modal, setModal] = React.useState<ModalKind>(null);
  const [toast, setToast] = React.useState<{ type: "error" | "success"; text: string } | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [clockOffset, setClockOffset] = React.useState(0);
  const [copied, setCopied] = React.useState<string | null>(null);

  const [rating, setRating] = React.useState<"POSITIVE" | "NEGATIVE" | null>(null);
  const [feedbackText, setFeedbackText] = React.useState("");
  const [mobileTab, setMobileTab] = React.useState<"details" | "chat">("details");
  const [showReceipt, setShowReceipt] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const lastMsgCount = React.useRef(0);

  const showToast = React.useCallback((type: "error" | "success", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const loadTrade = React.useCallback(async () => {
    if (!tradeId) return;
    try {
      const token = await getIdToken();
      const data = await getTradeDetails(token, tradeId);
      if (!data) {
        setNotFound(true);
      } else {
        setTrade(data);
        // Sincronizar con el reloj del servidor (el usuario no puede "congelar" el contador cambiando su hora)
        setClockOffset(new Date(data.serverNow).getTime() - Date.now());
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [tradeId]);

  React.useEffect(() => {
    waitForUser().then((u) => {
      if (!u) router.push("/auth");
      else setMyUid(u.uid);
    });
  }, [router]);

  // Tiempo real: el servidor avisa por SSE y recargamos al instante
  const live = useRealtime({ tradeId, enabled: !!tradeId && !!myUid }, () => {
    loadTrade();
  });

  // Sondeo de respaldo: lento si hay conexión en vivo, rápido si no
  React.useEffect(() => {
    if (!tradeId) return;
    loadTrade();
    const interval = setInterval(loadTrade, live ? 20000 : 4000);
    return () => clearInterval(interval);
  }, [tradeId, loadTrade, live]);

  // Reloj de 1 segundo
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll del chat y feedback auditivo/háptico al recibir mensajes nuevos
  React.useEffect(() => {
    const count = trade?.messages.length ?? 0;
    if (count !== lastMsgCount.current) {
      if (lastMsgCount.current > 0 && count > lastMsgCount.current) {
        hapticMessage();
        playChimeSound();
      }
      lastMsgCount.current = count;
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [trade?.messages.length]);

  const serverNow = now + clockOffset;
  const timeLeft = trade ? Math.max(0, Math.floor((new Date(trade.expiresAt).getTime() - serverNow) / 1000)) : 0;
  const appealIn = trade?.appealAvailableAt ? Math.max(0, Math.floor((new Date(trade.appealAvailableAt).getTime() - serverNow) / 1000)) : 0;

  // Al llegar a 0, pedir al servidor que aplique la expiración
  const expiredRef = React.useRef(false);
  React.useEffect(() => {
    if (trade?.status === "PENDING_PAYMENT" && timeLeft === 0 && !expiredRef.current) {
      expiredRef.current = true;
      loadTrade();
    }
  }, [timeLeft, trade?.status, loadTrade]);

  const runAction = async (fn: (token: string) => Promise<{ success: boolean; error?: string }>, okText: string) => {
    setBusy(true);
    try {
      const token = await getIdToken();
      const res = await fn(token);
      if (res.success) {
        showToast("success", okText);
        setModal(null);
      } else {
        showToast("error", res.error || "Ocurrió un error");
      }
      await loadTrade();
    } catch {
      showToast("error", "Error de conexión. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const handleSendMessage = async () => {
    const text = message.trim();
    if (!text) return;
    setMessage("");
    try {
      const res = await sendChatMessage(await getIdToken(), tradeId, text);
      if (!res.success) {
        showToast("error", res.error || "No se pudo enviar");
        setMessage(text);
      }
      loadTrade();
    } catch {
      setMessage(text);
      showToast("error", "Error de conexión");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("error", "El archivo supera el límite de 5 MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("tradeId", tradeId);
      formData.append("idToken", await getIdToken());
      const result = await uploadAttachment(formData);
      if (!result.success) showToast("error", result.error || "Error al subir archivo");
      loadTrade();
    } catch {
      showToast("error", "Error al subir el archivo. Revisa tu conexión.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const copy = (value: string, key: string) => {
    hapticTap();
    playCopySound();
    navigator.clipboard?.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleFeedbackSubmit = async () => {
    if (!rating) return;
    setBusy(true);
    const token = await getIdToken();
    const res = await leaveFeedback(token, tradeId, rating, feedbackText);
    if (res.success) {
      showToast("success", "¡Comentario guardado! Gracias por tu feedback");
      setModal(null);
      if (trade) setTrade({ ...trade, hasFeedback: true });
    } else {
      showToast("error", res.error);
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-zinc-500">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        Cargando Sala de Orden...
      </div>
    );
  }

  if (notFound || !trade) {
    return (
      <div className="max-w-md mx-auto text-center py-24">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Orden no disponible</h1>
        <p className="text-zinc-500 text-sm mb-6">La orden no existe o no tienes permiso para verla.</p>
        <button onClick={() => router.push("/dashboard/p2p")} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold">Volver al mercado</button>
      </div>
    );
  }

  const isBuyer = trade.viewerRole === "BUYER";
  const isSeller = trade.viewerRole === "SELLER";
  const otherParty = isBuyer ? trade.seller : trade.buyer;
  const meta = STATUS_META[trade.status] ?? STATUS_META.PENDING_PAYMENT;
  const StatusIcon = meta.icon;
  const sellerName = trade.seller.name || [trade.seller.firstName, trade.seller.lastName].filter(Boolean).join(" ") || "Vendedor";
  const buyerName = trade.buyer.name || [trade.buyer.firstName, trade.buyer.lastName].filter(Boolean).join(" ") || "Comprador";

  const steps = isBuyer ? [
    { key: "created", label: "Transferir pago", done: !!trade.paidAt || trade.status === "COMPLETED" || trade.status === "DISPUTED" },
    { key: "paid", label: "Esperando liberación", done: trade.status === "COMPLETED" },
    { key: "done", label: trade.status === "CANCELLED" ? "Cancelada" : "Completado", done: trade.status === "COMPLETED" || trade.status === "CANCELLED" },
  ] : [
    { key: "created", label: "Esperando pago", done: !!trade.paidAt || trade.status === "COMPLETED" || trade.status === "DISPUTED" },
    { key: "paid", label: "Liberar criptomonedas", done: trade.status === "COMPLETED" },
    { key: "done", label: trade.status === "CANCELLED" ? "Cancelada" : "Completado", done: trade.status === "COMPLETED" || trade.status === "CANCELLED" },
  ];

  return (
    <div className="max-w-6xl mx-auto pb-24">
      {/* Toast */}
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

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <button id="trade-back-btn" onClick={() => router.push("/dashboard/p2p")} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
            <ArrowLeft className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {isBuyer ? "Comprar" : isSeller ? "Vender" : "Revisión"} {fmt(trade.cryptoAmount)} USDT
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mt-0.5 font-mono">Orden #{trade.id.slice(-8).toUpperCase()}</p>
          </div>
        </div>
        <div className={`self-start sm:self-auto px-4 py-2 rounded-full border text-sm font-bold flex items-center gap-2 ${meta.color}`}>
          <StatusIcon className="w-4 h-4" /> {meta.label}
        </div>
      </div>

      {/* Stepper Binance Style */}
      <div className="mb-6 bg-white dark:bg-zinc-900 rounded-[2rem] p-5 sm:px-8 sm:py-6 border border-zinc-100 dark:border-zinc-800/60 shadow-sm flex items-start justify-between">
        {steps.map((s, i) => {
          const isCurrent = 
            (trade.status === "PENDING_PAYMENT" && i === 0) ||
            ((trade.status === "PAID" || trade.status === "DISPUTED") && i === 1) ||
            ((trade.status === "COMPLETED" || trade.status === "CANCELLED") && i === 2);
          
          let lineColor = "bg-zinc-100 dark:bg-zinc-800";
          if (i === 0 && trade.status !== "PENDING_PAYMENT") lineColor = "bg-emerald-500";
          if (i === 1 && trade.status === "COMPLETED") lineColor = "bg-emerald-500";

          return (
            <React.Fragment key={s.key}>
              <div className="flex flex-col items-center gap-2.5 relative z-10 w-24 sm:w-32 shrink-0">
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-black transition-all duration-300 shadow-sm
                  ${s.done || (i === 2 && trade.status === "COMPLETED")
                    ? "bg-emerald-500 text-white ring-4 ring-emerald-50 dark:ring-emerald-900/30" 
                    : trade.status === "CANCELLED" && i === 2
                    ? "bg-rose-500 text-white ring-4 ring-rose-50 dark:ring-rose-900/30"
                    : isCurrent 
                    ? "bg-amber-400 text-zinc-900 ring-4 ring-amber-50 dark:ring-amber-900/30 scale-110" 
                    : "bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 text-zinc-400"
                  }
                `}>
                  {s.done || (i===2 && trade.status === "COMPLETED") ? <Check className="w-5 h-5" /> : trade.status === "CANCELLED" && i === 2 ? <XCircle className="w-5 h-5" /> : i + 1}
                </div>
                <span className={`text-[10px] sm:text-xs font-bold text-center leading-tight ${
                  s.done || (i===2 && trade.status==="COMPLETED") ? "text-emerald-600 dark:text-emerald-400" 
                  : trade.status === "CANCELLED" && i === 2 ? "text-rose-600 dark:text-rose-400"
                  : isCurrent ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-400"
                }`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="flex-1 mt-[1.125rem] sm:mt-5 flex items-center px-1 sm:px-2">
                  <div className={`h-1 w-full rounded-full transition-colors duration-500 ${lineColor}`} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Selector de pestañas para móvil */}
      <div className="lg:hidden flex p-1 bg-zinc-100 dark:bg-zinc-900 rounded-2xl mb-4 border border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setMobileTab("details")}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
            mobileTab === "details"
              ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          📋 Datos y Pago
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("chat")}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === "chat"
              ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          💬 Chat en vivo
          {live && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda */}
        <div className={`space-y-6 lg:col-span-2 ${mobileTab === "details" ? "block" : "hidden lg:block"}`}>
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60">
            <div className="flex justify-between items-center mb-6 gap-4">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {trade.status === "PENDING_PAYMENT" && (isBuyer ? `Transfiere a ${sellerName}` : `Esperando el pago de ${buyerName}`)}
                {trade.status === "PAID" && (isBuyer ? "Esperando que el vendedor libere" : "Verifica el pago en tu banco")}
                {trade.status === "DISPUTED" && "Mediación en curso"}
                {trade.status === "CANCELLED" && "Orden cancelada"}
                {trade.status === "COMPLETED" && "¡Operación completada!"}
              </h2>
              {trade.status === "PENDING_PAYMENT" && (
                <div className={`px-4 py-2 rounded-xl flex items-center gap-2 font-black font-mono text-lg tabular-nums ${timeLeft < 180 ? "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 animate-pulse" : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"}`}>
                  <Clock className="w-4 h-4" /> {formatTime(timeLeft)}
                </div>
              )}
            </div>

            {/* Montos */}
            <div className="bg-gradient-to-br from-zinc-50 to-zinc-100/50 dark:from-zinc-950 dark:to-zinc-900 rounded-2xl p-6 mb-6 border border-zinc-100 dark:border-zinc-800 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Monto a transferir</span>
                <button onClick={() => copy(trade.fiatAmount.toFixed(2), "fiat")} className="flex items-center gap-2 text-2xl font-black text-zinc-900 dark:text-zinc-50 hover:text-emerald-600 transition-colors">
                  {fmt(trade.fiatAmount)} VES {copied === "fiat" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-zinc-400" />}
                </button>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-500">Precio</span>
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{fmt(trade.price, 3)} VES / USDT</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Cantidad de USDT</span>
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  {trade.escrowHeld ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />} {fmt(trade.cryptoAmount)} USDT
                </span>
              </div>
              {trade.makerFee > 0 && (
                <div className="flex justify-between items-center text-xs text-zinc-500">
                  <span>Comisión del anunciante (0.1%)</span>
                  <span>{fmt(trade.makerFee, 4)} USDT · el comprador recibe {fmt(trade.buyerReceives, 4)} USDT</span>
                </div>
              )}
            </div>

            {/* Datos bancarios */}
            {["PENDING_PAYMENT", "PAID", "DISPUTED"].includes(trade.status) && (
              <div className="space-y-4">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  Datos de pago del vendedor
                  {trade.seller.kycStatus === "VERIFIED" && <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> KYC</span>}
                </h3>
                {trade.sellerPaymentMethods.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-dashed border-zinc-200 dark:border-zinc-800 text-sm text-zinc-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando cuentas del vendedor...
                  </div>
                ) : (
                  trade.sellerPaymentMethods.map((m) => (
                    <div key={m.id} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                      <div className="sm:col-span-2 text-xs font-bold uppercase tracking-wider text-emerald-600">{m.type}{m.bank ? ` · ${m.bank}` : ""}</div>
                      {[
                        { k: "Titular", v: m.owner },
                        { k: "Cédula", v: m.cedula },
                        { k: "Cuenta", v: m.account },
                        { k: "Teléfono", v: m.phone },
                      ].filter((f) => f.v).map((f) => (
                        <button key={f.k} onClick={() => copy(f.v, m.id + f.k)} className="text-left bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 flex justify-between items-center hover:border-emerald-500/50 transition-colors group">
                          <div>
                            <span className="text-[11px] text-zinc-500 block">{f.k}</span>
                            <span className="font-medium text-zinc-900 dark:text-zinc-50 font-mono text-sm">{f.v}</span>
                          </div>
                          {copied === m.id + f.k ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-zinc-400 group-hover:text-emerald-500" />}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Paneles de estado */}
            {trade.status === "DISPUTED" && (
              <div className="mt-6 p-5 rounded-2xl bg-rose-500/5 border border-rose-500/20">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold mb-2"><Scale className="w-5 h-5" /> Un mediador de Roraima está revisando el caso</div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">Los fondos permanecen congelados. Sube capturas del comprobante y del estado de cuenta en el chat. No acuerdes nada fuera de la plataforma.</p>
                {trade.disputeReason && <p className="text-sm text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800"><b>Motivo:</b> {trade.disputeReason}</p>}
              </div>
            )}
            {trade.resolution && (
              <div className="mt-6 p-5 rounded-2xl bg-indigo-500/5 border border-indigo-500/20">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold mb-2"><Gavel className="w-5 h-5" /> Veredicto del mediador</div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {trade.resolution === "RELEASE_TO_BUYER" ? "Fallo a favor del comprador: USDT liberados." : "Fallo a favor del vendedor: USDT devueltos."}
                </p>
                {trade.resolutionNote && <p className="text-sm text-zinc-500 mt-1">{trade.resolutionNote}</p>}
              </div>
            )}
            {trade.status === "COMPLETED" && (
              <div className="mt-6 space-y-3">
                <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3 text-emerald-700 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                  <span>
                    {isBuyer
                      ? `Recibiste ${fmt(trade.buyerReceives)} USDT en tu billetera.`
                      : "Liberaste los USDT. ¡Gracias por operar con Roraima!"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    hapticTap();
                    setShowReceipt(true);
                  }}
                  className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-emerald-950/25 flex items-center justify-center gap-2.5 transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  <FileText className="w-4 h-4" />
                  <span>Ver y Compartir Comprobante Oficial (WhatsApp)</span>
                </button>
              </div>
            )}

            {/* Acciones */}
            <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-3">
              {isBuyer && trade.status === "PENDING_PAYMENT" && (
                <>
                  <button id="trade-mark-paid-btn" disabled={busy || timeLeft === 0} onClick={() => setModal("PAID")} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-transform hover:scale-[1.01] active:scale-[0.99]">
                    Ya transferí, notificar al vendedor
                  </button>
                  <button id="trade-cancel-btn" disabled={busy} onClick={() => setModal("CANCEL")} className="w-full py-3 text-zinc-500 hover:text-rose-600 font-semibold rounded-2xl transition-colors">
                    Cancelar orden
                  </button>
                </>
              )}

              {isSeller && trade.status === "PENDING_PAYMENT" && (
                <div className="w-full py-4 bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 font-semibold rounded-2xl text-center flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" /> Tus USDT están protegidos en Escrow mientras el comprador paga
                </div>
              )}

              {isSeller && trade.status === "PAID" && (
                <button id="trade-release-btn" disabled={busy} onClick={() => setModal("RELEASE")} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2">
                  <Unlock className="w-5 h-5" /> Pago recibido, liberar USDT
                </button>
              )}

              {isBuyer && trade.status === "PAID" && (
                <div className="w-full py-4 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold rounded-2xl text-center flex items-center justify-center gap-2">
                  <Hourglass className="w-4 h-4" /> El vendedor está verificando tu pago
                </div>
              )}

              {(isBuyer || isSeller) && trade.status === "PAID" && (
                <>
                  <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40 p-4 text-sm flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                    <span className="text-zinc-500">
                      Pagado por{" "}
                      <b className="text-zinc-800 dark:text-zinc-200">{trade.paymentMethodUsed ?? "—"}</b>
                    </span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Espera para apelar con este método: <b className="text-zinc-700 dark:text-zinc-300">{trade.appealCooldownMin} min</b>
                    </span>
                  </div>
                  <button id="trade-dispute-btn" disabled={busy || appealIn > 0} onClick={() => setModal("DISPUTE")} className="w-full py-3 bg-white dark:bg-zinc-900 border-2 border-rose-500/70 text-rose-600 font-bold rounded-2xl hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                    <Scale className="w-4 h-4" />
                    {appealIn > 0 ? `Apelar disponible en ${formatTime(appealIn)}` : isBuyer ? "Apelar (el vendedor no libera)" : "Apelar (no recibí el pago)"}
                  </button>
                  {appealIn > 0 && trade.appealCooldownMin > 0 && (
                    <div className="h-1 -mt-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-rose-500/70 transition-[width] duration-1000 ease-linear"
                        style={{ width: `${100 - (appealIn / (trade.appealCooldownMin * 60)) * 100}%` }}
                      />
                    </div>
                  )}
                </>
              )}

              {isBuyer && trade.status === "CANCELLED" && trade.canAppealCancellation && (
                <button id="trade-appeal-cancel-btn" disabled={busy} onClick={() => setModal("DISPUTE")} className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-transform hover:scale-[1.01] flex items-center justify-center gap-2">
                  <Scale className="w-5 h-5" /> Apelar cancelación (sí envié el dinero)
                </button>
              )}

              {trade.status === "COMPLETED" && !trade.hasFeedback && (
                <button id="trade-feedback-btn" disabled={busy} onClick={() => setModal("FEEDBACK")} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-600/20 transition-transform hover:scale-[1.01] flex items-center justify-center gap-2">
                  <ThumbsUp className="w-5 h-5" /> Calificar comerciante
                </button>
              )}
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 flex gap-3 text-amber-800 dark:text-amber-200 text-sm">
            <ShieldAlert className="w-5 h-5 flex-shrink-0" />
            <p>
              {isSeller
                ? "Nunca liberes antes de ver el dinero ACREDITADO en tu app bancaria. Verifica que el titular de la cuenta origen coincida con el comprador. Las capturas pueden ser falsas."
                : "Paga SOLO desde una cuenta bancaria a tu nombre. Pagos de terceros serán reembolsados y la cuenta puede ser suspendida. Roraima nunca te pedirá operar fuera de la plataforma."}
            </p>
          </div>
        </div>

        {/* Chat */}
        <div className={`bg-white dark:bg-zinc-900 rounded-[2rem] shadow-sm border border-zinc-100 dark:border-zinc-800/60 flex flex-col h-[640px] overflow-hidden ${mobileTab === "chat" ? "flex" : "hidden lg:flex"}`}>
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white font-bold">
              {otherParty?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-zinc-900 dark:text-zinc-50 truncate">{otherParty?.name || "Usuario"}</div>
              <div className="text-xs text-zinc-500 font-medium">{isBuyer ? "Vendedor" : isSeller ? "Comprador" : "Parte"}</div>
            </div>
            <div
              id="trade-live-indicator"
              title={live ? "Conectado en tiempo real" : "Reconectando… (actualizando cada pocos segundos)"}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${live ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : "text-zinc-500 bg-zinc-500/10 border-zinc-500/20"}`}
            >
              <span className="relative flex h-2 w-2">
                {live && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${live ? "bg-emerald-500" : "bg-zinc-400"}`} />
              </span>
              {live ? "En vivo" : "Conectando"}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f8f9fa] dark:bg-[#121212]">
            {trade.messages.map((msg) => {
              const isMine = msg.senderId === myUid;
              const time = new Date(msg.createdAt).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });

              if (msg.isSystem) {
                const isVerdict = msg.content.includes("VEREDICTO");
                return (
                  <div key={msg.id} className="flex justify-center my-4">
                    <div className={`max-w-[90%] rounded-xl px-4 py-2.5 text-xs font-medium text-center shadow-sm ${isVerdict ? "bg-indigo-50 border border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800/30 text-indigo-700 dark:text-indigo-300" : "bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/60 text-zinc-500 dark:text-zinc-400"}`}>
                      <div className="flex items-center justify-center gap-1.5 mb-1 font-bold uppercase tracking-wider text-[10px] text-emerald-600 dark:text-emerald-400">
                        <ShieldAlert className="w-3 h-3" /> Sistema Roraima · {time}
                      </div>
                      {msg.content.replace(/^\[SISTEMA\]\s*/, "")}
                    </div>
                  </div>
                );
              }

              const bubble = (() => {
                if (msg.content.startsWith("[ATTACHMENT:")) {
                  const inner = msg.content.slice(12, -1);
                  const sep = inner.indexOf(":", inner.indexOf("/uploads/"));
                  const url = sep > -1 ? inner.slice(0, sep) : inner;
                  const fileName = sep > -1 ? inner.slice(sep + 1) : "archivo";
                  // Solo se renderizan adjuntos alojados en nuestro servidor
                  if (!url.startsWith("/uploads/")) return <span className="italic opacity-70">Adjunto no válido</span>;
                  if (/\.(png|jpe?g|webp)$/i.test(url)) {
                    return (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={fileName} className="max-w-full max-h-[14rem] object-cover rounded-lg border border-black/5 dark:border-white/5" />
                      </a>
                    );
                  }
                  return (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline decoration-1 underline-offset-2 mt-1 bg-black/5 dark:bg-white/5 p-2 rounded-lg">
                      <FileText className="w-4 h-4 shrink-0" /> <span className="truncate max-w-[200px]">{fileName}</span>
                    </a>
                  );
                }
                return <span className="whitespace-pre-wrap break-words">{msg.content}</span>;
              })();

              if (msg.isStaff && !isMine) {
                return (
                  <div key={msg.id} className="flex justify-start mb-2">
                    <div className="max-w-[85%]">
                      <div className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-indigo-600 text-white shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200 mb-1 flex items-center gap-1"><Gavel className="w-3 h-3" /> Mediador Roraima</div>
                        {bubble}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-1 font-medium px-1">{time}</div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} mb-2`}>
                  <div className="max-w-[82%] relative group">
                    <div className={`rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed shadow-sm ${
                      isMine 
                        ? "bg-emerald-500 text-white rounded-br-sm" 
                        : "bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/50 text-zinc-900 dark:text-zinc-50 rounded-bl-sm"
                    }`}>
                      {bubble}
                    </div>
                    <div className={`text-[10px] font-medium text-zinc-400 mt-1 px-1 ${isMine ? "text-right" : ""}`}>{time}</div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="relative flex items-center">
              <input type="file" ref={fileInputRef} className="hidden" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={handleFileSelect} />
              <button
                id="trade-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute left-2 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50 transition-colors"
                title="Adjuntar imagen o PDF (máx. 5 MB)"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
              </button>
              <input
                id="trade-chat-input"
                type="text"
                value={message}
                maxLength={2000}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder={uploading ? "Subiendo archivo..." : "Escribe un mensaje..."}
                disabled={uploading}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-full pl-12 pr-12 py-3 text-sm outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
              />
              <button
                id="trade-send-btn"
                onClick={handleSendMessage}
                disabled={uploading || !message.trim()}
                className="absolute right-2 p-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white rounded-full transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modales */}
      <AnimatePresence>
        {modal && modal !== "FEEDBACK" && (
          <ConfirmModal
            kind={modal}
            trade={trade}
            busy={busy}
            onClose={() => !busy && setModal(null)}
            onConfirm={(reason, code, methodId) => {
              if (modal === "PAID") runAction((t) => markTradeAsPaid(t, trade.id, methodId), "Pago notificado al vendedor");
              if (modal === "CANCEL") runAction((t) => cancelTrade(t, trade.id), "Orden cancelada");
              if (modal === "RELEASE") runAction((t) => releaseTrade(t, trade.id, code), "USDT liberados al comprador");
              if (modal === "DISPUTE") runAction((t) => disputeTrade(t, trade.id, reason ?? ""), "Apelación enviada a mediación");
            }}
          />
        )}

        {modal === "FEEDBACK" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !busy && setModal(null)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 shadow-2xl">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Calificar experiencia</h3>
              <p className="text-sm text-zinc-500 mb-6">¿Cómo fue tu intercambio con el comerciante?</p>
              
              <div className="flex gap-4 mb-6">
                <button onClick={() => setRating("POSITIVE")} className={`flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all ${rating === "POSITIVE" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400" : "border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:border-emerald-500/50"}`}>
                  <ThumbsUp className="w-8 h-8" />
                  <span className="font-bold">Positiva</span>
                </button>
                <button onClick={() => setRating("NEGATIVE")} className={`flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all ${rating === "NEGATIVE" ? "border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400" : "border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:border-rose-500/50"}`}>
                  <ThumbsDown className="w-8 h-8" />
                  <span className="font-bold">Negativa</span>
                </button>
              </div>

              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Escribe un comentario (opcional)"
                className="w-full p-4 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl outline-none focus:border-indigo-500 transition-colors resize-none mb-6 text-sm"
                rows={3}
                maxLength={250}
              />

              <div className="flex gap-3">
                <button disabled={busy} onClick={() => setModal(null)} className="flex-1 py-3 text-zinc-600 dark:text-zinc-300 font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">Cancelar</button>
                <button disabled={busy || !rating} onClick={handleFeedbackSubmit} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]">
                  {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Enviar"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Comprobante Digital */}
      <DigitalReceiptModal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        data={
          trade
            ? {
                folio: `RRX-${trade.id.slice(0, 8).toUpperCase()}`,
                type: isBuyer ? "P2P_BUY" : "P2P_SELL",
                cryptoAmount: isBuyer ? trade.buyerReceives : trade.cryptoAmount,
                cryptoCurrency: "USDT",
                fiatAmount: trade.fiatAmount,
                fiatCurrency: "VES",
                exchangeRate: trade.price,
                paymentMethod: trade.paymentMethodUsed || "Pago Móvil",
                counterpartyName:
                  otherParty?.name ||
                  [otherParty?.firstName, otherParty?.lastName].filter(Boolean).join(" ") ||
                  "Comerciante",
                counterpartyDetail: isBuyer ? "Vendedor P2P" : "Comprador P2P",
                date: trade.completedAt || trade.createdAt,
              }
            : null
        }
      />
    </div>
  );
}

function ConfirmModal({
  kind, trade, busy, onClose, onConfirm,
}: {
  kind: Exclude<ModalKind, null | "FEEDBACK">;
  trade: Trade;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason?: string, twoFactorCode?: string, paymentMethodId?: string) => void;
}) {
  const [checks, setChecks] = React.useState<boolean[]>([false, false, false]);
  const [reason, setReason] = React.useState("");
  const [twoFactorCode, setTwoFactorCode] = React.useState("");
  const methods = trade.sellerPaymentMethods;
  const [methodId, setMethodId] = React.useState<string | undefined>(methods.length === 1 ? methods[0].id : undefined);

  const config = {
    PAID: {
      title: "Confirmar pago",
      icon: CheckCircle2,
      tone: "emerald",
      cta: "Sí, ya transferí",
      text: `Confirma que transferiste exactamente ${fmt(trade.fiatAmount)} VES al vendedor.`,
      checklist: ["Transferí el monto exacto", "Pagué desde una cuenta bancaria a MI nombre", "Entiendo que marcar como pagado sin pagar es fraude y causa suspensión"],
    },
    CANCEL: {
      title: "Cancelar orden",
      icon: XCircle,
      tone: "rose",
      cta: "Cancelar orden",
      text: "Si ya transferiste el dinero, NO canceles: los USDT volverán al vendedor. Cancelar repetidamente puede restringir tu cuenta.",
      checklist: ["No he realizado ningún pago al vendedor"],
    },
    RELEASE: {
      title: "Liberar USDT",
      icon: Unlock,
      tone: "emerald",
      cta: `Liberar ${fmt(trade.cryptoAmount)} USDT`,
      text: "Esta acción es IRREVERSIBLE. Los USDT se transferirán inmediatamente al comprador.",
      checklist: [
        `Vi ${fmt(trade.fiatAmount)} VES ACREDITADOS en mi app bancaria (no solo una captura)`,
        "El titular de la cuenta origen coincide con el nombre del comprador",
        "Entiendo que esta acción no se puede deshacer",
      ],
    },
    DISPUTE: {
      title: trade.status === "CANCELLED" ? "Apelar cancelación" : "Abrir apelación",
      icon: Scale,
      tone: "amber",
      cta: "Enviar a mediación",
      text: "Un mediador revisará el chat y los comprobantes. Los fondos quedarán congelados hasta el veredicto. Las apelaciones falsas conllevan sanciones.",
      checklist: [] as string[],
    },
  }[kind];

  const Icon = config.icon;
  const allChecked = config.checklist.every((_, i) => checks[i]);
  const valid2FA = kind === "RELEASE" && trade.twoFactorEnabled ? twoFactorCode.length === 6 : true;
  const validMethod = kind === "PAID" ? Boolean(methodId) : true;
  const valid = kind === "DISPUTE" ? reason.trim().length >= 10 : (allChecked && valid2FA && validMethod);
  const toneBtn = config.tone === "rose" ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20" : config.tone === "amber" ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20" : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20";
  const toneIcon = config.tone === "rose" ? "bg-rose-500/10 text-rose-500" : config.tone === "amber" ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.92, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 10, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl border border-zinc-100 dark:border-zinc-800"
      >
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${toneIcon}`}><Icon className="w-7 h-7" /></div>
        <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">{config.title}</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">{config.text}</p>

        {kind === "PAID" && methods.length > 0 && (
          <div className="mb-5">
            <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">¿A qué cuenta del vendedor transferiste?</div>
            <div className="space-y-2">
              {methods.map((m) => (
                <label
                  key={m.id}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${methodId === m.id ? "border-emerald-500/60 bg-emerald-500/5" : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
                >
                  <span className="flex items-center gap-3">
                    <input type="radio" name="paid-method" checked={methodId === m.id} onChange={() => setMethodId(m.id)} className="w-4 h-4 accent-emerald-600" />
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{m.label}</span>
                  </span>
                  <span className="text-[11px] text-zinc-500 whitespace-nowrap">Apelación tras {m.appealMinutes} min</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {config.checklist.length > 0 && (
          <div className="space-y-2 mb-6">
            {config.checklist.map((label, i) => (
              <label key={i} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checks[i] ? "border-emerald-500/50 bg-emerald-500/5" : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}>
                <input type="checkbox" checked={checks[i]} onChange={(e) => setChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
              </label>
            ))}
          </div>
        )}

        {kind === "DISPUTE" && (
          <div className="mb-6">
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">Describe lo ocurrido</label>
            <textarea
              id="dispute-reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Ej: Transferí 380 VES por Pago Móvil a las 10:42, referencia 001234. El vendedor no responde."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-amber-500 resize-none"
            />
            <div className="text-[11px] text-zinc-400 mt-1 text-right">{reason.trim().length}/1000 · mínimo 10</div>
          </div>
        )}

        {kind === "RELEASE" && trade.twoFactorEnabled && (
          <div className="mb-6">
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">Código 2FA de Autenticador</label>
            <input
              type="text"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-center text-xl tracking-[0.5em] font-mono outline-none focus:border-emerald-500"
            />
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={busy} className="flex-1 py-3 rounded-2xl font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Volver</button>
          <button
            id="confirm-modal-submit"
            onClick={() => onConfirm(reason, twoFactorCode, methodId)}
            disabled={!valid || busy}
            className={`flex-[1.4] py-3 rounded-2xl font-bold text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 ${toneBtn}`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {config.cta}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
