"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { Navbar } from "@/components/navbar";
import { Send, Bot, User as UserIcon, Headset, CheckCircle2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

type Msg = { id: string; from: "me" | "bot" | "agent" | "user"; content: string; createdAt: string; senderName: string; options?: { label: string; topic: string }[] };
type Thread = { id: string; subject: string; status: string; messages: Msg[] } | null;

const QUICK_OPTIONS = [
  { label: "Reportar una estafa", topic: "FRAUD" },
  { label: "Problemas con depósito o retiro", topic: "DEPOSIT" },
  { label: "Verificación KYC rechazada", topic: "KYC" },
  { label: "Hablar con un Agente", topic: "GENERAL" },
];

const WELCOME: Msg = {
  id: "welcome",
  from: "bot",
  senderName: "RoraimaBot",
  createdAt: "",
  content: "¡Hola! Soy RoraimaBot 🏔️. Estoy aquí para ayudarte. Por favor, indícame cuál es tu consulta o selecciona una opción rápida:",
  options: QUICK_OPTIONS,
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Esperando a un agente",
  ANSWERED: "Un agente respondió",
};

function ContactoChat() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tipo = searchParams.get("tipo");
  const [thread, setThread] = useState<Thread>(null);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | undefined>(tipo === "comerciante" ? "MERCHANT" : undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prefilled = useRef(false);

  const load = React.useCallback(async () => {
    try {
      const { waitForUser, getIdToken } = await import("@/lib/client-auth");
      const u = await waitForUser();
      if (!u) { setLoaded(true); return; }
      const { getMySupportThread } = await import("@/app/actions/support");
      const res = await getMySupportThread(await getIdToken());
      if (res.success) setThread(res.ticket as Thread);
    } catch {
      /* se mostrará la bienvenida */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000); // nuevas respuestas del agente
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (tipo === "comerciante" && !prefilled.current) {
      prefilled.current = true;
      setInput("Quiero ser comerciante verificado. Mi volumen mensual estimado es de ___ USDT y opero con ___.");
    }
  }, [tipo]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length, isTyping]);

  const handleSend = async (text: string, topicHint?: string) => {
    if (!text.trim() || isTyping) return;
    setError(null);

    const { waitForUser, getIdToken } = await import("@/lib/client-auth");
    if (!(await waitForUser())) {
      setError("Debes iniciar sesión para abrir un ticket de soporte.");
      setTimeout(() => router.push("/auth"), 1200);
      return;
    }

    setInput("");
    setIsTyping(true);
    // Mensaje optimista
    setThread((prev) => ({
      id: prev?.id ?? "pending",
      subject: prev?.subject ?? text,
      status: "OPEN",
      messages: [...(prev?.messages ?? []), { id: `tmp-${Date.now()}`, from: "me", content: text, createdAt: new Date().toISOString(), senderName: "Tú" }],
    }));
    try {
      const { sendSupportMessage } = await import("@/app/actions/support");
      const res = await sendSupportMessage(await getIdToken(), { content: text, topic: topicHint ?? topic });
      if (!res.success) setError(res.error);
      setTopic(undefined);
      await load();
    } catch {
      setError("No se pudo enviar tu mensaje. Revisa tu conexión.");
    } finally {
      setIsTyping(false);
    }
  };

  const handleClose = async () => {
    if (!thread || thread.id === "pending") return;
    const { getIdToken } = await import("@/lib/client-auth");
    const { closeMySupportTicket } = await import("@/app/actions/support");
    const res = await closeMySupportTicket(await getIdToken(), thread.id);
    if (res.success) setThread(null);
    else setError(res.error);
  };

  const messages: Msg[] = thread ? thread.messages : [WELCOME];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <Navbar />
      
      <main className="flex-grow pt-24 pb-8 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden flex flex-col h-[75vh]">
          
          {/* Header */}
          <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                <Bot className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h1 className="font-bold text-zinc-900 dark:text-zinc-50 text-xl">Centro de Soporte</h1>
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {thread ? `Ticket #${thread.id.slice(0, 8).toUpperCase()} · ${STATUS_LABEL[thread.status] ?? thread.status}` : "En línea"}
                </p>
              </div>
            </div>
            {thread && thread.id !== "pending" && (
              <button
                id="support-close-ticket"
                onClick={handleClose}
                className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" /> Marcar como resuelto
              </button>
            )}
          </div>

          {/* Chat Area */}
          <div className="flex-grow overflow-y-auto p-6 space-y-6">
            {!loaded ? (
              <div className="flex justify-center p-6"><span className="text-zinc-500 text-sm animate-pulse">Cargando conversación...</span></div>
            ) : messages.map((msg) => {
              const mine = msg.from === "me";
              return (
              <div key={msg.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-end gap-2 max-w-[80%] ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                  
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${mine ? 'bg-zinc-200 dark:bg-zinc-800' : msg.from === 'agent' ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-emerald-100 dark:bg-emerald-900/50'}`}>
                    {mine ? <UserIcon className="w-4 h-4 text-zinc-600 dark:text-zinc-400" /> : msg.from === 'agent' ? <Headset className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> : <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                  </div>
                  
                  <div className={`p-4 rounded-2xl ${
                    mine 
                      ? 'bg-emerald-600 text-white rounded-br-sm' 
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-sm'
                  }`}>
                    {msg.from === "agent" && <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">{msg.senderName} · Soporte Roraima</p>}
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    
                    {/* Options (if bot) */}
                    {msg.options && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {msg.options.map((opt, i) => (
                          <button 
                            key={i}
                            id={`support-option-${opt.topic.toLowerCase()}`}
                            onClick={() => handleSend(opt.label, opt.topic)}
                            className="text-xs bg-white dark:bg-zinc-700 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-full font-medium hover:bg-emerald-50 dark:hover:bg-zinc-600 transition-colors border border-emerald-100 dark:border-zinc-600"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {msg.createdAt && (
                  <span className="text-[10px] text-zinc-400 mt-1 px-10">{new Date(msg.createdAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}</span>
                )}
              </div>
            );})}
            
            {isTyping && (
              <div className="flex items-end gap-2 max-w-[80%]">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 rounded-bl-sm flex items-center gap-1">
                  <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            {error && <p className="text-xs text-rose-500 font-medium mb-2 px-2">{error}</p>}
            <div className="flex items-center gap-2">
              <input 
                id="support-input"
                type="text"
                value={input}
                maxLength={2000}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                placeholder="Escribe tu mensaje..."
                className="flex-grow bg-zinc-100 dark:bg-zinc-950 border border-transparent focus:border-emerald-500 rounded-full px-6 py-3.5 outline-none text-zinc-900 dark:text-zinc-50 transition-colors"
              />
              <button 
                id="support-send"
                onClick={() => handleSend(input)}
                disabled={isTyping}
                className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center text-white flex-shrink-0 transition-transform active:scale-95"
              >
                <Send className="w-5 h-5 ml-1" />
              </button>
            </div>
            <p className="text-center text-xs text-zinc-400 mt-3">
              En caso de denuncias legales, se requerirá un ticket formal firmado.
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}

export default function ContactoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950" />}>
      <ContactoChat />
    </Suspense>
  );
}
