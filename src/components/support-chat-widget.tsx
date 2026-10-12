"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Headphones, X, Send, ArrowLeft, ChevronRight, Shield, CreditCard, Wallet,
  AlertTriangle, HelpCircle, Loader2, Bot, User as UserIcon, CheckCircle2,
  MessageSquare, History, Globe, Maximize2, Minimize2,
} from "lucide-react";
import Link from "next/link";
import { getIdToken, waitForUser } from "@/lib/client-auth";

type Topic = "FRAUD" | "DEPOSIT" | "KYC" | "MERCHANT" | "GENERAL";
type Msg = { id: string; content: string; createdAt: string; from: "me" | "bot" | "user" | "agent"; senderName: string };

const TOPICS: { id: Topic; icon: typeof Shield; label: string; desc: string }[] = [
  { id: "KYC", icon: Shield, label: "Verificación de identidad", desc: "KYC, documentos, selfie" },
  { id: "DEPOSIT", icon: CreditCard, label: "Depósitos y retiros", desc: "TRC20, TXID, fondos" },
  { id: "FRAUD", icon: AlertTriangle, label: "Apelaciones o Disputas P2P", desc: "Reportar estafa, mediación" },
  { id: "MERCHANT", icon: Wallet, label: "Servicios P2P", desc: "Comerciante, anuncios" },
  { id: "GENERAL", icon: HelpCircle, label: "Más funciones", desc: "Ayuda general, seguridad" },
];

const QUICK_QUESTIONS = [
  "¿Cómo depositar criptomonedas desde otra plataforma?",
  "¿Dónde encuentro mi reporte de impuestos?",
  "¿Cómo verificar mi identidad?",
];

export function SupportChatWidget() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [view, setView] = React.useState<"home" | "chat">("home");
  const [expanded, setExpanded] = React.useState(false);
  const [userName, setUserName] = React.useState<string | null>(null);
  const [ticket, setTicket] = React.useState<{
    id: string; subject: string; status: string; type: string; messages: Msg[];
  } | null>(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loadingThread, setLoadingThread] = React.useState(false);
  const [recentTrade, setRecentTrade] = React.useState<{ id: string; amount: number; price: number; status: string; type: string; completedAt: string | null } | null>(null);
  const [authed, setAuthed] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Global event listener for opening the widget
  React.useEffect(() => {
    const handleOpen = (e: any) => {
      setIsOpen(true);
      if (e.detail?.prefill) {
        setView("chat");
        setText(e.detail.prefill);
      }
    };
    window.addEventListener("open-support", handleOpen);
    return () => window.removeEventListener("open-support", handleOpen);
  }, []);

  // Auth & load existing thread
  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const user = await waitForUser();
      if (!user || cancelled) return;
      setAuthed(true);
      setUserName(user.displayName || user.email?.split("@")[0] || "Usuario");
      // Load existing ticket
      setLoadingThread(true);
      const { getMySupportThread } = await import("@/app/actions/support");
      const res = await getMySupportThread(await user.getIdToken());
      if (!cancelled && res.success && res.ticket) {
        setTicket(res.ticket);
      }
      // Load latest P2P trade
      try {
        const { fetchMyTrades } = await import("@/app/actions/p2p");
        const trades = await fetchMyTrades(await user.getIdToken());
        if (!cancelled && trades.length > 0) {
          const recent = trades[0];
          setRecentTrade({
            id: recent.id,
            amount: recent.cryptoAmount,
            price: recent.price,
            status: recent.status,
            type: recent.side === "BUY" ? "Comprar" : "Vender",
            completedAt: null,
          });
        }
      } catch {}
      setLoadingThread(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Auto-scroll chat
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket?.messages?.length]);

  // Reload ticket
  const refreshTicket = React.useCallback(async () => {
    const { getMySupportThread } = await import("@/app/actions/support");
    const res = await getMySupportThread(await getIdToken());
    if (res.success && res.ticket) setTicket(res.ticket);
  }, []);

  // Auto-refresh when in chat
  React.useEffect(() => {
    if (!isOpen || view !== "chat" || !ticket) return;
    const i = setInterval(refreshTicket, 8000);
    return () => clearInterval(i);
  }, [isOpen, view, ticket, refreshTicket]);

  const sendMessage = async (content: string, topic?: Topic) => {
    if (!content.trim()) return;
    setBusy(true);
    const { sendSupportMessage } = await import("@/app/actions/support");
    const res = await sendSupportMessage(await getIdToken(), { content, topic });
    if (res.success) {
      setText("");
      await refreshTicket();
      setView("chat");
    }
    setBusy(false);
  };

  const openWithTopic = (topic: Topic) => {
    sendMessage(`Necesito ayuda con: ${TOPICS.find((t) => t.id === topic)?.label}`, topic);
  };

  // Móvil: ocupa todo el ancho (sin salirse); desde sm vuelve al panel flotante
  const panelWidth = expanded ? "sm:left-auto sm:w-[480px]" : "sm:left-auto sm:w-[380px]";
  const panelHeight = expanded ? "h-[90dvh]" : "h-[85dvh] sm:h-[600px] sm:max-h-[85vh]";

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            id="support-chat-fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6 z-[80] w-12 h-12 md:w-14 md:h-14 bg-amber-400 hover:bg-amber-500 rounded-2xl shadow-2xl shadow-amber-500/30 flex items-center justify-center transition-colors group"
            title="Atención al cliente"
          >
            <Headphones className="w-6 h-6 text-zinc-900" />
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              whileHover={{ opacity: 1, x: 0 }}
              className="absolute right-full mr-3 bg-zinc-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap pointer-events-none"
            >
              Atención al cliente
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className={`fixed bottom-2 left-2 right-2 sm:bottom-4 sm:right-4 z-[85] ${panelWidth} ${panelHeight} bg-white dark:bg-zinc-900 rounded-[1.5rem] shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden`}
          >
            {/* Header */}
            <div className="px-5 py-4 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {view === "chat" && (
                  <button onClick={() => setView("home")} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <ArrowLeft className="w-4 h-4 text-zinc-500" />
                  </button>
                )}
                <div className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center">
                  <Headphones className="w-5 h-5 text-zinc-900" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 leading-tight">
                    {view === "chat" ? "Chat de Soporte" : "Soporte de Roraima"}
                  </h3>
                  <span className="text-[11px] text-zinc-500">Pregúntame lo que quieras</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setExpanded(!expanded)} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors hidden sm:flex">
                  {expanded ? <Minimize2 className="w-4 h-4 text-zinc-500" /> : <Maximize2 className="w-4 h-4 text-zinc-500" />}
                </button>
                <button
                  onClick={() => { setIsOpen(false); setView("home"); }}
                  className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4 text-zinc-500" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {view === "home" ? (
                  <motion.div
                    key="home"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-5 space-y-5"
                  >
                    {/* Greeting */}
                    <div>
                      <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                        Hola {userName ?? ""}
                      </h2>
                      <p className="text-sm text-zinc-500">Te Damos La Bienvenida Al Soporte De Roraima Exchange</p>
                    </div>

                    {/* Quick Access */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Acceso rápido</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => openWithTopic("GENERAL")}
                          className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 rounded-2xl text-left hover:border-amber-400 transition-colors"
                        >
                          <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mb-2" />
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-50">¿Buscas ayuda?</div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">Cómo depositar criptomonedas …</div>
                        </button>
                        <button
                          onClick={() => openWithTopic("DEPOSIT")}
                          className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/30 rounded-2xl text-left hover:border-zinc-400 transition-colors"
                        >
                          <CreditCard className="w-5 h-5 text-zinc-600 dark:text-zinc-400 mb-2" />
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Depósito cripto desde otra …</div>
                        </button>
                      </div>
                    </div>

                    {/* Existing ticket */}
                    {ticket && (
                      <button
                        onClick={() => setView("chat")}
                        className="w-full p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200/50 dark:border-indigo-800/30 rounded-2xl text-left hover:border-indigo-400 transition-colors flex items-center gap-3"
                      >
                        <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-50 truncate">Continuar conversación</div>
                          <div className="text-[11px] text-zinc-500 truncate">{ticket.subject}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                      </button>
                    )}

                    {/* Recent Trade */}
                    {recentTrade && (
                      <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4 border border-zinc-200/50 dark:border-zinc-700/30">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-zinc-500">P2P</span>
                          <Link href={`/dashboard/p2p/trade/${recentTrade.id}`} className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">Consultar</Link>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                              {recentTrade.amount} USDT → {Math.round(recentTrade.amount * recentTrade.price).toLocaleString("es-VE")} VES
                            </div>
                            <div className="text-[11px] text-zinc-500">{recentTrade.type}</div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                            recentTrade.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : recentTrade.status === "DISPUTED"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          }`}>
                            ● {recentTrade.status === "COMPLETED" ? "Completado" : recentTrade.status === "DISPUTED" ? "En disputa" : recentTrade.status === "PAID" ? "Pagado" : "Pendiente"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Topics */}
                    <div>
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50 mb-3 block">Temas</span>
                      <div className="grid grid-cols-4 gap-3">
                        {TOPICS.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => openWithTopic(t.id)}
                            className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
                          >
                            <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-amber-100 dark:group-hover:bg-amber-900/20 transition-colors">
                              <t.icon className="w-5 h-5 text-zinc-600 dark:text-zinc-400 group-hover:text-amber-600 transition-colors" />
                            </div>
                            <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400 text-center leading-tight">{t.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="chat"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col h-full"
                  >
                    {/* Chat History Banner */}
                    {ticket && ticket.messages.length > 5 && (
                      <div className="text-center py-2">
                        <button className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1 mx-auto">
                          <History className="w-3 h-3" /> Ver historial de chat
                        </button>
                      </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 px-4 py-3 space-y-3 overflow-y-auto">
                      {loadingThread ? (
                        <div className="flex justify-center py-10">
                          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                        </div>
                      ) : (
                        <>
                          {/* Initial bot greeting if no messages */}
                          {(!ticket || ticket.messages.length === 0) && (
                            <div className="flex items-start gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
                                <Bot className="w-4 h-4 text-zinc-900" />
                              </div>
                              <div className="bg-amber-50 dark:bg-amber-900/10 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[80%]">
                                <p className="text-sm text-zinc-900 dark:text-zinc-50">
                                  👋 ¡Hola! Este el Soporte de Roraima. ¿Cómo puedo ayudarte hoy?
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Real messages */}
                          {ticket?.messages.map((m) => {
                            const isMe = m.from === "me";
                            const isBot = m.from === "bot";
                            const isAgent = m.from === "agent";
                            return (
                              <div key={m.id} className={`flex items-end gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
                                {!isMe && (
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                                    isBot ? "bg-amber-400" : isAgent ? "bg-indigo-500" : "bg-zinc-300 dark:bg-zinc-700"
                                  }`}>
                                    {isBot ? <Bot className="w-4 h-4 text-zinc-900" /> : isAgent ? <Headphones className="w-4 h-4 text-white" /> : <UserIcon className="w-4 h-4 text-zinc-600" />}
                                  </div>
                                )}
                                <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                                  isMe
                                    ? "bg-emerald-600 text-white rounded-br-sm"
                                    : isBot
                                    ? "bg-amber-50 dark:bg-amber-900/10 text-zinc-900 dark:text-zinc-50 rounded-bl-sm"
                                    : isAgent
                                    ? "bg-indigo-50 dark:bg-indigo-900/10 text-zinc-900 dark:text-zinc-50 rounded-bl-sm"
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 rounded-bl-sm"
                                }`}>
                                  {m.content}
                                </div>
                              </div>
                            );
                          })}

                          <div ref={endRef} />
                        </>
                      )}
                    </div>

                    {/* Quick Suggestions */}
                    {ticket && ticket.messages.length <= 2 && (
                      <div className="px-4 py-2 space-y-2 border-t border-zinc-100 dark:border-zinc-800">
                        {QUICK_QUESTIONS.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => sendMessage(q)}
                            disabled={busy}
                            className="w-full text-left px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-sm text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-2"
                          >
                            <HelpCircle className="w-4 h-4 text-zinc-400 shrink-0" />
                            {q}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Input */}
                    <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
                      <div className="flex items-center gap-2">
                        <input
                          ref={inputRef}
                          id="support-widget-input"
                          type="text"
                          value={text}
                          maxLength={2000}
                          onChange={(e) => setText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && !busy && sendMessage(text)}
                          placeholder="Escribe tu pregunta aquí"
                          className="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-amber-500 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50 outline-none transition-colors"
                        />
                        <button
                          id="support-widget-send"
                          onClick={() => sendMessage(text)}
                          disabled={busy || !text.trim()}
                          className="w-11 h-11 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-40 text-zinc-900 flex items-center justify-center transition-colors"
                        >
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
