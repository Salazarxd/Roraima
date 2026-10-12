"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Clock, Crown, Loader2, Lock, LogIn, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Mascot, SpeechBubble } from "@/components/mascot";

type MarketAd = { id: string; price: number; minAmount: number; maxAmount: number; user: { id: string } };
type Unit = "VES" | "USDT";
type QuoteRes = Awaited<ReturnType<typeof import("@/app/actions/p2p").getExpressBuyQuote>>;
type Quote = Extract<QuoteRes, { success: true }>["quote"];

const bs = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function P2PExpressPage() {
  const router = useRouter();
  const [tradeType, setTradeType] = React.useState<"buy" | "sell">("buy");
  const [activeCount, setActiveCount] = React.useState(0);

  // Precarga desde la portada: ?amount=1000&unit=VES|USDT (Rori) o ?side=sell (legado)
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("side") === "sell") setTradeType("sell");
  }, []);

  React.useEffect(() => {
    (async () => {
      const { waitForUser } = await import("@/lib/client-auth");
      const u = await waitForUser();
      if (!u) return;
      const { fetchMyTrades } = await import("@/app/actions/p2p");
      const trades = await fetchMyTrades(await u.getIdToken());
      setActiveCount(trades.filter((t) => ["PENDING_PAYMENT", "PAID", "DISPUTED"].includes(t.status)).length);
    })();
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-12">
      {/* Top Navbar Simulation (en móvil se desliza horizontalmente) */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex items-center gap-5 md:justify-between overflow-x-auto no-scrollbar whitespace-nowrap pb-3 md:pb-4 border-b border-zinc-100 dark:border-zinc-800 text-sm font-medium">
        <div className="flex gap-5 shrink-0">
          <button className="text-emerald-600 dark:text-emerald-400 font-bold">
            Rápido
          </button>
          <button onClick={() => router.push('/dashboard/p2p')} className="text-zinc-500 hover:text-emerald-500 transition-colors">
            Cuenta P2P
          </button>
        </div>
        
        <div className="flex gap-5 items-center shrink-0">
          <button onClick={() => router.push('/dashboard/p2p/my-ads')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Mis anuncios</button>
          <button onClick={() => router.push('/dashboard/p2p/orders')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Órdenes</button>
          <button onClick={() => router.push('/dashboard/p2p/orders')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors flex items-center gap-1">Chat {activeCount > 0 && <span className="bg-amber-400 text-amber-900 text-[10px] font-black px-1.5 py-0.5 rounded-md">{activeCount}</span>}</button>
          <button onClick={() => router.push('/dashboard/p2p/user-center')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Centro de usuario</button>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="grid grid-cols-2 w-full sm:w-auto p-1 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              id={`express-tab-${s}`}
              onClick={() => setTradeType(s)}
              className={`relative px-6 sm:px-8 py-2.5 rounded-xl text-sm font-bold transition-colors ${tradeType === s ? (s === "buy" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300") : "text-zinc-500"}`}
            >
              {tradeType === s && <motion.span layoutId="express-tab" className="absolute inset-0 -z-10 rounded-xl bg-white dark:bg-zinc-800 shadow-sm" />}
              {s === "buy" ? "Comprar" : "Vender"}
            </button>
          ))}
        </div>
      </div>

      {tradeType === "buy" ? <ExpressBuy /> : <ExpressSell />}
    </div>
  );
}

// ============================================================================
//  COMPRA RÁPIDA CON RORI: anuncio promocionado (VIP) + detalles + reglas
// ============================================================================

type Stage = "auth" | "ask" | "quoting" | "quote" | "error";

function ExpressBuy() {
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>("quoting");
  const [unit, setUnit] = React.useState<Unit>("VES");
  const [amount, setAmount] = React.useState("");
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [blocker, setBlocker] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [accepted, setAccepted] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [typing, setTyping] = React.useState(true);
  const [loginUrl, setLoginUrl] = React.useState("/auth");
  const onTyping = React.useCallback((t: boolean) => setTyping(t), []);

  const num = parseFloat(amount.replace(",", ".")) || 0;

  const fetchQuote = React.useCallback(async (amt: number, u: Unit) => {
    setStage("quoting");
    setError(null);
    setAccepted(false);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { getExpressBuyQuote } = await import("@/app/actions/p2p");
      const res = await getExpressBuyQuote({ idToken: await getIdToken(), amount: amt, unit: u });
      if (res.success) {
        setQuote(res.quote);
        setBlocker(res.blocker);
        setStage("quote");
      } else {
        setError(res.error);
        setStage("error");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular la compra");
      setStage("error");
    }
  }, []);

  // Llega desde Rori en la portada con ?amount=&unit=
  React.useEffect(() => {
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const u: Unit = q.get("unit") === "USDT" ? "USDT" : "VES";
      const amt = parseFloat((q.get("amount") ?? "").replace(/[^0-9.]/g, ""));
      setUnit(u);
      if (amt > 0) setAmount(String(amt));
      setLoginUrl(`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);

      const { waitForUser } = await import("@/lib/client-auth");
      const user = await waitForUser();
      if (!user) return setStage("auth");
      if (amt > 0) fetchQuote(amt, u);
      else setStage("ask");
    })();
  }, [fetchQuote]);

  const confirm = async () => {
    if (!quote) return;
    setConfirming(true);
    setError(null);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { processTrade } = await import("@/app/actions/p2p");
      const res = await processTrade({ idToken: await getIdToken(), orderId: quote.orderId, fiatAmount: quote.fiatAmount, expectedPrice: quote.price });
      if (res.success) router.push(`/dashboard/p2p/trade/${res.tradeId}`);
      else setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la orden");
    } finally {
      setConfirming(false);
    }
  };

  const message =
    stage === "auth"
      ? "¡Hola! Inicia sesión para continuar con tu compra 🔐"
      : stage === "ask"
        ? "¿Cuánto quieres comprar? Elige si lo calculo en bolívares o en USDT 👇"
        : stage === "quoting"
          ? "Buscando la mejor oferta para ti… 🔎"
          : stage === "error"
            ? (error ?? "Algo salió mal")
            : quote
              ? unit === "VES"
                ? `¡Listo! Con ${bs(quote.fiatAmount)} Bs recibes ${usdt(quote.cryptoAmount)} USDT 🎉`
                : `¡Listo! Para recibir ${usdt(quote.cryptoAmount)} USDT pagas ${bs(quote.fiatAmount)} Bs 🎉`
              : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-6 lg:gap-12 items-start">
      {/* Rori */}
      <div className="lg:sticky lg:top-8 min-w-0">
        <h1 className="text-[1.75rem] leading-tight sm:text-4xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-white">
          Compra rápida <span className="text-brand-gradient">con Rori</span>
        </h1>
        <p className="mt-2 sm:mt-3 text-sm sm:text-base text-zinc-500 max-w-md">
          Te conectamos con un vendedor destacado al instante. Los USDT quedan bloqueados en Escrow hasta que confirmes el pago.
        </p>
        <div className="mt-5 sm:mt-8 flex items-end gap-2 sm:gap-4">
          <Mascot size={120} mobileSize={76} talking={typing} wave={stage === "quote" && !typing} />
          <div className="flex-1 min-w-0 pb-5 sm:pb-8">
            <SpeechBubble text={message} onTyping={onTyping} className="text-sm sm:text-base" />
          </div>
        </div>
      </div>

      {/* Panel */}
      <div className="min-w-0 rounded-[1.75rem] sm:rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-2xl shadow-zinc-900/5 p-4 sm:p-7">
        <AnimatePresence mode="wait">
          {stage === "auth" && (
            <motion.div key="auth" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center py-6">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <Lock className="w-7 h-7" />
              </div>
              <h2 className="mt-4 text-xl font-bold text-zinc-900 dark:text-white">Inicia sesión para continuar</h2>
              <p className="mt-1 text-sm text-zinc-500">Guardamos tu monto: al entrar te mostramos la oferta.</p>
              <div className="mt-6 grid gap-3">
                <Link href={loginUrl} className="inline-flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold shadow-lg shadow-emerald-500/25">
                  <LogIn className="w-5 h-5" /> Iniciar sesión
                </Link>
                <Link href={loginUrl.replace("/auth?", "/auth?modo=registro&")} className="py-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 font-bold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  Crear cuenta gratis
                </Link>
              </div>
            </motion.div>
          )}

          {stage === "ask" && (
            <motion.div key="ask" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Calcular en</p>
              <div className="mt-2 grid grid-cols-2 gap-2 p-1 rounded-2xl bg-zinc-100 dark:bg-zinc-950">
                {(["VES", "USDT"] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnit(u)}
                    className={`relative py-2.5 rounded-xl text-sm font-bold transition-colors ${unit === u ? "text-zinc-900 dark:text-white" : "text-zinc-500"}`}
                  >
                    {unit === u && <motion.span layoutId="express-unit" className="absolute inset-0 -z-10 rounded-xl bg-white dark:bg-zinc-800 shadow-sm" />}
                    {u === "VES" ? "Bolívares" : "USDT"}
                    <span className="hidden sm:inline font-medium text-zinc-400"> {u === "VES" ? "(lo que pagas)" : "(lo que recibes)"}</span>
                  </button>
                ))}
              </div>
              <label htmlFor="express-amount" className="block mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {unit === "VES" ? "Bolívares que vas a pagar" : "USDT que quieres recibir"}
              </label>
              <div className="mt-2 flex items-center gap-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-4 py-3.5 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
                <input
                  id="express-amount"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, "").replace(/([.,])(?=.*[.,])/g, "").slice(0, 12))}
                  onKeyDown={(e) => e.key === "Enter" && num > 0 && fetchQuote(num, unit)}
                  className="min-w-0 flex-1 bg-transparent text-3xl font-bold text-zinc-900 dark:text-white outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
                />
                <span className="shrink-0 px-3 py-1.5 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-bold">{unit === "VES" ? "Bs" : "USDT"}</span>
              </div>
              <button
                id="express-quote"
                onClick={() => fetchQuote(num, unit)}
                disabled={!num}
                className="mt-6 w-full inline-flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-lg shadow-lg shadow-emerald-500/25 disabled:opacity-40"
              >
                Ver oferta <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {stage === "quoting" && (
            <motion.div key="quoting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {[72, 120, 96].map((h, i) => (
                <div key={i} className="rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 animate-pulse" style={{ height: h }} />
              ))}
            </motion.div>
          )}

          {stage === "error" && (
            <motion.div key="error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="py-4">
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" /> <span>{error}</span>
              </div>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => setStage("ask")} className="py-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 font-bold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  Cambiar monto
                </button>
                <Link href="/dashboard/p2p" className="py-3.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-center">
                  Ver mercado P2P
                </Link>
              </div>
            </motion.div>
          )}

          {stage === "quote" && quote && (
            <motion.div key="quote" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {/* Resumen */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <p className="text-xs font-semibold text-zinc-500">Pagas</p>
                  <p className="mt-1 text-lg sm:text-2xl font-black break-all text-zinc-900 dark:text-white tabular-nums">{bs(quote.fiatAmount)}</p>
                  <p className="text-xs font-bold text-zinc-500">Bs</p>
                </div>
                <div className="rounded-2xl p-4 bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Recibes</p>
                  <p className="mt-1 text-lg sm:text-2xl font-black break-all text-emerald-600 dark:text-emerald-400 tabular-nums">{usdt(quote.cryptoAmount)}</p>
                  <p className="text-xs font-bold text-emerald-700/70 dark:text-emerald-400/70">USDT</p>
                </div>
              </div>

              {/* Vendedor */}
              <div className={`mt-4 rounded-2xl p-4 border ${quote.seller.vip ? "border-amber-400/50 bg-gradient-to-br from-amber-400/10 to-transparent" : "border-zinc-200 dark:border-zinc-800"}`}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white font-bold text-lg">
                    {quote.seller.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link href={`/dashboard/p2p/user/${quote.seller.id}`} className="font-bold text-zinc-900 dark:text-white hover:underline truncate">
                        {quote.seller.name}
                      </Link>
                      {quote.seller.kycVerified && <BadgeCheck className="w-4 h-4 text-emerald-500" />}
                      {quote.seller.vip && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 px-1.5 py-0.5 rounded-md">
                          <Crown className="w-3 h-3" /> VIP · Destacado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {quote.seller.rankEmoji} {quote.seller.rankLabel} · {quote.stats.orders30d} órdenes (30d) ·{" "}
                      {quote.stats.completionRate != null ? `${quote.stats.completionRate}% completado` : "Nuevo"}
                      {quote.stats.avgReleaseMin != null && ` · libera en ~${quote.stats.avgReleaseMin} min`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Detalles */}
              <dl className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
                <Row label="Precio" value={`${bs(quote.price)} Bs/USDT`} />
                <Row label="Métodos de pago" value={
                  <span className="flex flex-wrap justify-end gap-1">
                    {quote.methods.split(",").map((m) => m.trim()).filter(Boolean).map((m) => (
                      <span key={m} className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold">{m}</span>
                    ))}
                  </span>
                } />
                <Row label="Límites del anuncio" value={`${bs(quote.minAmount)} – ${bs(quote.maxAmount)} Bs`} />
                <Row label={<span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Tiempo para pagar</span>} value={`${quote.paymentWindowMin} min`} />
                <Row label="Comisión para ti" value={<span className="text-emerald-600 dark:text-emerald-400 font-bold">0 %</span>} />
              </dl>

              {/* Reglas */}
              <div className="mt-4 rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 space-y-2">
                <p className="flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" /> Los USDT del vendedor quedan bloqueados en Escrow al confirmar.</p>
                <p className="flex gap-2"><Wallet className="w-4 h-4 text-emerald-500 shrink-0" /> Paga solo desde una cuenta a tu nombre (la misma cédula de tu verificación).</p>
                <p className="flex gap-2"><AlertCircle className="w-4 h-4 text-amber-500 shrink-0" /> No escribas &quot;USDT&quot; ni &quot;cripto&quot; en el concepto, y marca &quot;He pagado&quot; solo después de transferir.</p>
              </div>

              {blocker ? (
                <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-sm">
                  <p className="font-bold">Antes de comprar:</p>
                  <p className="mt-1">{blocker}</p>
                  {/KYC|verificaci/i.test(blocker) && (
                    <Link href="/kyc" className="mt-3 inline-flex items-center gap-1 font-bold underline">Verificar mi identidad <ArrowRight className="w-4 h-4" /></Link>
                  )}
                </div>
              ) : (
                <label className="mt-4 flex items-start gap-3 cursor-pointer select-none">
                  <input id="express-accept" type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-500" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Entiendo las reglas y pagaré en los próximos {quote.paymentWindowMin} minutos.</span>
                </label>
              )}

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                id="express-confirm"
                onClick={confirm}
                disabled={confirming || !!blocker || !accepted}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-lg shadow-lg shadow-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {confirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                Confirmar compra
              </button>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs font-semibold">
                <button onClick={() => setStage("ask")} className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                  <ArrowLeft className="w-3.5 h-3.5" /> Cambiar monto
                </button>
                <button onClick={() => fetchQuote(num, unit)} className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                  <RefreshCw className="w-3.5 h-3.5" /> Actualizar
                </button>
                <Link href="/dashboard/p2p" className="text-emerald-600 dark:text-emerald-400 hover:underline">Más ofertas</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-zinc-500 shrink-0">{label}</dt>
      <dd className="font-semibold text-zinc-900 dark:text-white text-right">{value}</dd>
    </div>
  );
}

// ============================================================================
//  VENTA RÁPIDA (sin cambios de lógica: toma el mejor anuncio de compra)
// ============================================================================

function ExpressSell() {
  const router = useRouter();
  const [amountInput, setAmountInput] = React.useState("");
  const [ads, setAds] = React.useState<MarketAd[]>([]);
  const [loadingPrice, setLoadingPrice] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [myUid, setMyUid] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      setLoadingPrice(true);
      const { fetchP2POrders } = await import("@/app/actions/p2p");
      const { getIdToken, waitForUser } = await import("@/lib/client-auth");
      let token: string | undefined;
      try { token = await getIdToken(); } catch { }
      const u = await waitForUser();
      if (u) setMyUid(u.uid);
      setAds(await fetchP2POrders("BUY", token));
      setLoadingPrice(false);
    })();
  }, []);

  const amount = parseFloat(amountInput);
  const others = ads.filter((a) => a.user.id !== myUid);
  // Anuncio que se tomaría: el primero (VIP / mejor precio) cuyo límite admite el monto
  const match = React.useMemo(() => {
    if (isNaN(amount) || amount <= 0) return null;
    return others.find((a) => {
      const fiat = amount * a.price;
      return fiat >= a.minAmount && fiat <= a.maxAmount;
    }) ?? null;
  }, [others, amount]);
  const currentPrice = match?.price ?? others[0]?.price ?? 0;
  const minFiat = others.length ? Math.min(...others.map((a) => a.minAmount)) : 0;
  const maxFiat = others.length ? Math.max(...others.map((a) => a.maxAmount)) : 0;
  const calculatedOutput = !amountInput || currentPrice === 0 || isNaN(amount) ? "0.00" : (amount * currentPrice).toFixed(2);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { expressTrade } = await import("@/app/actions/p2p");
      const res = await expressTrade({ idToken: await getIdToken(), side: "sell", amount });
      if (res.success) router.push(`/dashboard/p2p/trade/${res.tradeId}`);
      else setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la orden");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-12 items-center">
      <div className="flex-1 space-y-4">
        <h1 className="text-4xl md:text-6xl font-bold text-zinc-900 dark:text-white leading-tight">
          P2P Rápido <br />
          Vende USDT por VES
        </h1>
        <p className="text-lg text-zinc-500 max-w-lg">
          Vende tus USDT al instante al mejor comprador disponible, protegido por el Escrow de Roraima.
        </p>
      </div>

      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl border border-zinc-100 dark:border-zinc-800 p-6 space-y-6">
          <div className="relative bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 focus-within:border-rose-500 transition-colors">
            <label className="text-xs font-bold text-zinc-500 block mb-2">Vendes</label>
            <div className="flex justify-between items-center">
              <input
                type="text"
                value={amountInput}
                onChange={(e) => { setAmountInput(e.target.value.replace(/[^0-9.]/g, "")); setError(null); }}
                placeholder="0.00"
                className="bg-transparent text-2xl font-bold text-zinc-900 dark:text-white outline-none w-full"
              />
              <div className="px-3 py-1 bg-white dark:bg-zinc-900 rounded-lg shadow-sm font-bold text-sm text-zinc-700 dark:text-zinc-200 shrink-0">USDT</div>
            </div>
          </div>

          <div className="relative bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
            <label className="text-xs font-bold text-zinc-500 block mb-2">Recibes</label>
            <div className="flex justify-between items-center">
              <input type="text" value={calculatedOutput} readOnly className="bg-transparent text-2xl font-bold text-zinc-900 dark:text-white outline-none w-full" />
              <div className="px-3 py-1 bg-white dark:bg-zinc-900 rounded-lg shadow-sm font-bold text-sm text-zinc-700 dark:text-zinc-200 shrink-0">VES</div>
            </div>
          </div>

          <div className="pt-2 text-xs text-zinc-500 space-y-1">
            <div className="flex justify-between">
              <span>Precio estimado</span>
              <span>{loadingPrice ? "Cargando…" : currentPrice > 0 ? `1 USDT ≈ ${currentPrice.toFixed(2)} VES` : "Sin anuncios disponibles"}</span>
            </div>
            {others.length > 0 && (
              <div className="flex justify-between">
                <span>Límites del mercado</span>
                <span>{minFiat.toLocaleString()} – {maxFiat.toLocaleString()} VES</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Tasa de comisión</span>
              <span>0.00%</span>
            </div>
          </div>

          <AnimatePresence>
            {(error || (!isNaN(amount) && amount > 0 && !match && !loadingPrice)) && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error ?? "Ningún anuncio admite ese monto en este momento. Ajusta el monto o revisa el mercado P2P."}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            id="express-submit"
            onClick={submit}
            disabled={submitting || !match}
            className="w-full py-4 rounded-xl font-bold text-white shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
          >
            {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
            Vender USDT
          </button>
        </div>
      </div>
    </div>
  );
}
