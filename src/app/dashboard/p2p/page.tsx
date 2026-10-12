"use client";

import * as React from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { 
  Search, 
  Filter, 
  CheckCircle2, 
  ChevronDown,
  X,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Ban,
  ThumbsUp,
  ThumbsDown,
  MessageSquare
} from "lucide-react";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 }
  }
};

import { useRouter } from "next/navigation";

// Remove mock static array
export default function P2PPage() {
  const router = useRouter();
  const [tradeType, setTradeType] = React.useState<"buy" | "sell">("buy");
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedMerchant, setSelectedMerchant] = React.useState<any | null>(null);
  const [selectedMethod, setSelectedMethod] = React.useState<string>("Todos los métodos");
  const [showMethodDropdown, setShowMethodDropdown] = React.useState(false);
  const [filterAmount, setFilterAmount] = React.useState<string>("");
  const [myUid, setMyUid] = React.useState<string | null>(null);
  const [activeCount, setActiveCount] = React.useState(0);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [blocking, setBlocking] = React.useState(false);
  const [merchantComments, setMerchantComments] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (!selectedMerchant) {
      setMerchantComments([]);
      return;
    }
    (async () => {
      const { getUserReputation } = await import("@/app/actions/feedback");
      const res = await getUserReputation(selectedMerchant.user.id);
      if (res.success && res.reputation.recentFeedback) {
        setMerchantComments(res.reputation.recentFeedback.filter((f: any) => f.comment));
      }
    })();
  }, [selectedMerchant]);

  React.useEffect(() => {
    const loadOrders = async () => {
      setLoading(true);
      const { fetchP2POrders } = await import("@/app/actions/p2p");
      // If user wants to BUY, they are looking for SELL orders from merchants
      // If user wants to SELL, they are looking for BUY orders from merchants
      const { getIdToken } = await import("@/lib/client-auth");
      let token: string | undefined;
      try { token = await getIdToken(); } catch { }
      const dbType = tradeType === "buy" ? "SELL" : "BUY";
      const data = await fetchP2POrders(dbType, token);
      setOrders(data);
      setLoading(false);
    };
    loadOrders();
  }, [tradeType, reloadKey]);

  // Usuario actual + órdenes en curso (badge real)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { waitForUser } = await import("@/lib/client-auth");
      const u = await waitForUser();
      if (!u || cancelled) return;
      setMyUid(u.uid);
      const { fetchMyTrades } = await import("@/app/actions/p2p");
      const trades = await fetchMyTrades(await u.getIdToken());
      if (!cancelled) setActiveCount(trades.filter((t) => ["PENDING_PAYMENT", "PAID", "DISPUTED"].includes(t.status)).length);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const visibleOrders = orders.filter((o) => {
    if (selectedMethod !== "Todos los métodos") {
      const methods = String(o.methods || "").split(",").map(normalize);
      if (!methods.some((m) => m.includes(normalize(selectedMethod)) || normalize(selectedMethod).includes(m))) return false;
    }
    const amt = parseFloat(filterAmount);
    if (!isNaN(amt) && amt > 0 && (amt < o.minAmount || amt > o.maxAmount)) return false;
    return true;
  });

  // Buy Modal State
  const [amountBs, setAmountBs] = React.useState<string>("");
  const [processing, setProcessing] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const feePercentage = 0; // El tomador no paga comisión (la paga el anunciante)
  
  const calculateTrade = () => {
    if (!selectedMerchant || !amountBs) return { grossUsdt: 0, feeUsdt: 0, netUsdt: 0 };
    const bs = parseFloat(amountBs);
    if (isNaN(bs)) return { grossUsdt: 0, feeUsdt: 0, netUsdt: 0 };
    
    const grossUsdt = bs / selectedMerchant.price;
    const feeUsdt = grossUsdt * (feePercentage / 100);
    const netUsdt = grossUsdt - feeUsdt;
    
    return { grossUsdt, feeUsdt, netUsdt };
  };

  const tradeData = calculateTrade();
  const amountNum = parseFloat(amountBs);
  const amountOutOfRange =
    !!selectedMerchant && !isNaN(amountNum) && (amountNum < selectedMerchant.minAmount || amountNum > selectedMerchant.maxAmount);

  const handleTrade = async () => {
    if (!selectedMerchant || !tradeData.netUsdt) return;
    if (amountOutOfRange) {
      setErrorMessage(`El monto debe estar entre ${selectedMerchant.minAmount.toLocaleString()} y ${selectedMerchant.maxAmount.toLocaleString()} VES`);
      return;
    }
    setProcessing(true);
    setErrorMessage(null);
    try {
      const { auth } = await import("@/lib/firebase");
      const user = auth.currentUser;
      if (!user) {
        setErrorMessage("Debes iniciar sesión para operar.");
        setProcessing(false);
        return;
      }
      const { processTrade } = await import("@/app/actions/p2p");
      const result = await processTrade({
        idToken: await user.getIdToken(),
        orderId: selectedMerchant.id,
        fiatAmount: amountNum
      });

      if (result.success && result.tradeId) {
        setSuccessMessage(`¡Orden de ${tradeType === "buy" ? "Compra" : "Venta"} creada! Redirigiendo al Escrow...`);
        // Redirigir a la sala de trade después de un breve delay
        setTimeout(() => {
          router.push(`/dashboard/p2p/trade/${result.tradeId}`);
        }, 1500);
      } else {
        setErrorMessage(result.error || "Error desconocido");
        setProcessing(false);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Hubo un error procesando la transacción.");
      setProcessing(false);
    }
  };
  const handleBlockUser = async () => {
    if (!selectedMerchant || !selectedMerchant.user) return;
    if (confirm(`¿Estás seguro de que quieres bloquear a ${selectedMerchant.user.name}? Ya no verás sus anuncios ni él los tuyos.`)) {
      setBlocking(true);
      try {
        const { getIdToken } = await import("@/lib/client-auth");
        const { blockUser } = await import("@/app/actions/blacklist");
        const res = await blockUser(await getIdToken(), selectedMerchant.user.id);
        if (res.success) {
          setOrders(orders.filter(o => o.o.userId !== selectedMerchant.user.id));
          setSelectedMerchant(null);
        } else {
          setErrorMessage(res.error);
        }
      } catch (e) {
        setErrorMessage("Error de red");
      }
      setBlocking(false);
    }
  };

  const [showMoreDropdown, setShowMoreDropdown] = React.useState(false);

  return (
    <div className="relative">
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
        
        {/* Top P2P Navigation Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4 mb-2 pb-3 md:pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex gap-6 text-sm font-medium">
            <button onClick={() => router.push('/dashboard/p2p/express')} className="text-zinc-500 hover:text-emerald-500 transition-colors">Rápido</button>
            <button className="text-emerald-600 dark:text-emerald-400 relative">
              Cuenta P2P
              <span className="hidden md:block absolute -bottom-4.5 left-0 right-0 h-0.5 bg-emerald-500 rounded-t-full"></span>
            </button>
          </div>
          
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 sm:gap-6 text-sm font-medium items-center relative">
            <button id="p2p-my-orders-btn" onClick={() => router.push('/dashboard/p2p/orders')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Órdenes</button>
            <button id="p2p-chat-btn" onClick={() => router.push('/dashboard/p2p/orders')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors flex items-center gap-1">Chat {activeCount > 0 && <span className="bg-amber-400 text-amber-900 text-[10px] font-black px-1.5 py-0.5 rounded-md">{activeCount}</span>}</button>
            <button id="p2p-user-center-btn" onClick={() => router.push('/dashboard/p2p/user-center')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Centro de usuario</button>
            
            {/* "Más" Dropdown */}
            <div className="relative z-50">
              <button 
                onClick={() => setShowMoreDropdown(!showMoreDropdown)}
                className="flex items-center gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
              >
                Más
                <ChevronDown className="w-4 h-4" />
              </button>
              
              <AnimatePresence>
                {showMoreDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMoreDropdown(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 top-full mt-2 w-[min(18rem,calc(100vw-2rem))] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl shadow-xl z-50 p-2"
                    >
                      <div className="flex flex-col">
                        <button 
                          onClick={() => router.push("/dashboard/p2p/payment-methods")}
                          className="flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl text-left text-sm text-zinc-700 dark:text-zinc-300 transition-colors"
                        >
                          Métodos de pago en P2P
                        </button>
                        <button 
                          onClick={() => router.push("/dashboard/p2p/post-ad")}
                          className="flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl text-left text-sm text-zinc-700 dark:text-zinc-300 transition-colors"
                        >
                          Publicar nuevo anuncio
                        </button>
                        <button 
                          onClick={() => router.push("/dashboard/p2p/my-ads")}
                          className="flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl text-left text-sm text-zinc-700 dark:text-zinc-300 transition-colors"
                        >
                          Mis anuncios
                        </button>
                        <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2"></div>
                        <button 
                          onClick={() => { setShowMoreDropdown(false); window.dispatchEvent(new CustomEvent("open-support", { detail: { topic: "MERCHANT", prefill: "Quiero ser comerciante verificado. Mi volumen mensual estimado es de ___ USDT y opero con ___." } })); }}
                          className="flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl text-left text-sm text-zinc-700 dark:text-zinc-300 transition-colors"
                        >
                          Conviértete en comerciante verificado
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        {/* Filters Panel (Sticky) */}
        <div className="sticky top-0 z-[40] pt-2 pb-4 -mx-4 px-4 md:-mx-8 md:px-8 bg-zinc-50 dark:bg-zinc-950 border-b border-transparent shadow-[0_4px_20px_-15px_rgba(0,0,0,0.1)]">
          <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-3xl p-4 sm:p-5 shadow-sm border border-zinc-100 dark:border-zinc-800/60 flex flex-col md:flex-row gap-3">
            
            {/* Buy / Sell Tabs */}
            <div className="relative flex p-1 bg-zinc-100 dark:bg-zinc-950 rounded-2xl md:w-56 shrink-0">
              <button
                onClick={() => setTradeType("buy")}
                className={`relative flex-1 py-2 text-sm font-semibold rounded-xl transition-colors z-10 ${
                  tradeType === "buy" ? (tradeType === "buy" ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-900 dark:text-zinc-50") : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                Comprar
              </button>
              <button
                onClick={() => setTradeType("sell")}
                className={`relative flex-1 py-2 text-sm font-semibold rounded-xl transition-colors z-10 ${
                  tradeType === "sell" ? (tradeType === "sell" ? "text-rose-700 dark:text-rose-300" : "text-zinc-900 dark:text-zinc-50") : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                Vender
              </button>
              
              {/* Animated Tab Indicator */}
              <motion.div
                className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl shadow-sm z-0 ${tradeType === "buy" ? "bg-white dark:bg-zinc-800" : "bg-white dark:bg-zinc-800"}`}
                initial={false}
                animate={{ left: tradeType === "buy" ? "4px" : "calc(50%)" }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            </div>

            <div className="hidden md:block w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

            {/* Amount Input */}
            <div className="flex-[1.5] relative flex items-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 transition-colors focus-within:border-emerald-500 dark:focus-within:border-emerald-400">
              <span className="text-zinc-400 text-sm font-medium mr-2">Monto</span>
              <input 
                id="p2p-filter-amount"
                type="number" 
                inputMode="decimal"
                value={filterAmount}
                onChange={(e) => setFilterAmount(e.target.value)}
                placeholder="Ej. 1000" 
                className="w-full bg-transparent text-zinc-900 dark:text-zinc-50 outline-none text-sm"
              />
              <span className="text-zinc-500 font-semibold text-sm ml-2">VES</span>
            </div>

            {/* Payment Method Selector */}
            <div className="flex-[2] relative">
              <div 
                onClick={() => setShowMethodDropdown(!showMethodDropdown)}
                className="h-full flex items-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              >
                <span className="text-zinc-400 text-sm font-medium mr-2 whitespace-nowrap">Método:</span>
                <span className="w-full text-zinc-900 dark:text-zinc-50 text-sm font-medium truncate">{selectedMethod}</span>
                <ChevronDown className={`w-4 h-4 text-zinc-400 ml-2 flex-shrink-0 transition-transform ${showMethodDropdown ? 'rotate-180' : ''}`} />
              </div>

              <AnimatePresence>
                {showMethodDropdown && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowMethodDropdown(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl shadow-xl z-40 max-h-64 overflow-y-auto"
                    >
                      {[
                        "Todos los métodos", "Pago Movil", "Banesco", "Banco de Venezuela", "Mercantil", 
                        "Transferencia Bancaria", "Provincial", "Bancamiga", "BNC Banco Nacional de Crédito", 
                        "BBVA", "Bancaribe", "Banco del Tesoro", "Banco Venezolano de Crédito", "Banplus", 
                        "Banco Digital de los Trabajadores", "Banco Plaza", "BFC Banco Fondo Común", 
                        "Banco Activo", "R4 Banco Microfinanciero", "N58 Banco Digital", "Recarga Pines", "Otros"
                      ].map((method) => (
                        <div 
                          key={method}
                          onClick={() => {
                            setSelectedMethod(method);
                            setShowMethodDropdown(false);
                          }}
                          className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                        >
                          {method}
                        </div>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <button
              id="p2p-refresh-btn"
              title="Actualizar y limpiar filtros"
              onClick={() => { setFilterAmount(""); setSelectedMethod("Todos los métodos"); setReloadKey((k) => k + 1); }}
              className="md:w-auto w-full flex items-center justify-center shrink-0 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 p-2.5 rounded-2xl transition-colors"
            >
              <Filter className="w-5 h-5" />
            </button>
          </motion.div>
          
          {/* Table Header (Desktop only) */}
          {!loading && visibleOrders.length > 0 && (
            <div className="hidden lg:flex px-6 mt-4 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              <div className="flex-[2]">Anunciante</div>
              <div className="flex-[1] text-right">Precio</div>
              <div className="flex-[1.5] text-right">Disponible / Límites</div>
              <div className="flex-[1] text-center">Pago</div>
              <div className="flex-[0.8] text-right">Comprar/Vender</div>
            </div>
          )}
        </div>

        {/* Merchants List */}
        <motion.div variants={itemVariants} className="space-y-3 lg:space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 rounded-[2rem] lg:rounded-2xl p-5 sm:p-6 lg:p-4 shadow-sm border border-zinc-100 dark:border-zinc-800/60 animate-pulse">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 lg:gap-6">
                  <div className="flex-[2] flex flex-col w-full lg:w-auto">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                      <div className="space-y-2">
                        <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                        <div className="h-3 w-48 bg-zinc-100 dark:bg-zinc-800/60 rounded-md" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-[1] flex flex-col lg:items-end w-full lg:w-auto order-3 lg:order-2">
                    <div className="h-6 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                  </div>
                  <div className="flex-[1.5] flex flex-col lg:items-end w-full lg:w-auto order-4 lg:order-3">
                    <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-md mb-1" />
                    <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-800/60 rounded-md" />
                  </div>
                  <div className="flex-[1] flex gap-2 w-full lg:w-auto order-2 lg:order-4 border-t lg:border-t-0 border-zinc-100 dark:border-zinc-800 pt-3 lg:pt-0">
                    <div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                    <div className="h-5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                  </div>
                  <div className="flex-[0.8] w-full lg:w-auto order-5 mt-2 lg:mt-0">
                    <div className="h-10 w-full bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
                  </div>
                </div>
              </div>
            ))
          ) : visibleOrders.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-10 text-center border border-zinc-100 dark:border-zinc-800/60 mt-4">
              <Search className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
              <h3 className="font-bold text-zinc-900 dark:text-zinc-50 mb-1">
                {orders.length === 0 ? `No hay anuncios de ${tradeType === "buy" ? "venta" : "compra"} publicados` : "Ningún anuncio coincide con tus filtros"}
              </h3>
              <p className="text-sm text-zinc-500 mb-5">
                {orders.length === 0 ? "Sé el primero en publicar un anuncio en el mercado." : "Prueba con otro monto o método de pago."}
              </p>
              <button onClick={() => router.push("/dashboard/p2p/post-ad")} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-colors">
                Publicar anuncio
              </button>
            </div>
          ) : visibleOrders.map((order) => {
            const methodsArray = order.methods ? order.methods.split(',') : [];
            const isVerified = order.user?.kycStatus === "VERIFIED";
            const userName = order.user?.name || "Anónimo";
            const isMine = !!myUid && order.user?.id === myUid;

            return (
              <div key={order.id} className={`relative bg-white dark:bg-zinc-900 rounded-[2rem] lg:rounded-2xl p-5 sm:p-6 lg:p-4 shadow-sm border hover:shadow-md transition-shadow ${order.user?.vip ? "border-amber-400/60 dark:border-amber-400/40 lg:ring-1 lg:ring-amber-400/20 shadow-amber-500/10" : "border-zinc-100 dark:border-zinc-800/60"}`}>
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 lg:gap-6">
                  
                  {/* Merchant Info (2) */}
                  <div className="flex-[2] flex flex-col w-full lg:w-auto">
                    <div className="flex items-center gap-3 lg:mb-0 mb-2">
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                          {userName.charAt(0)}
                        </div>
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900 ${
                            (order.user as any)?.isOnline ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                          }`}
                          title={(order.user as any)?.isOnline ? "En línea ahora" : "Desconectado"}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => router.push(`/dashboard/p2p/user/${order.user?.id}`)}>
                          <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-base truncate">{userName}</h3>
                          {isVerified && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                          {order.user?.vip && (
                            <span title="VIP" className="text-[10px] font-black bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 px-1.5 py-0.5 rounded-md shadow-sm">VIP</span>
                          )}
                          {(order.user as any)?.isOnline && (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                              En línea
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 flex items-center flex-wrap gap-1.5 mt-0.5">
                          <span>{order.stats?.orders30d ?? 0} órdenes</span>
                          <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                          <span>{order.stats?.completionRate != null ? `${order.stats.completionRate}%` : "Nuevo"}</span>
                          {order.stats?.feedbackScore != null && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{order.stats.feedbackScore}%</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Price (1) */}
                  <div className="flex-[1] flex flex-row lg:flex-col justify-between items-center lg:items-end w-full lg:w-auto order-3 lg:order-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 block lg:hidden">Precio</span>
                    <div className="text-xl lg:text-lg font-black text-zinc-900 dark:text-zinc-50">
                      {order.price.toFixed(2)} <span className="text-xs font-medium text-zinc-400">VES</span>
                    </div>
                  </div>

                  {/* Limits (1.5) */}
                  <div className="flex-[1.5] flex flex-row lg:flex-col justify-between items-center lg:items-end w-full lg:w-auto order-4 lg:order-3">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 block lg:hidden">Límites</span>
                    <div className="text-right">
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5"><span className="hidden lg:inline">Disponible:</span> <span className="font-semibold text-zinc-700 dark:text-zinc-300">{Number(order.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</span></div>
                      <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {order.minAmount.toLocaleString()} - {order.maxAmount.toLocaleString()} VES
                      </div>
                    </div>
                  </div>

                  {/* Payment Methods (1) */}
                  <div className="flex-[1] flex flex-wrap lg:justify-center gap-1.5 w-full lg:w-auto order-2 lg:order-4 border-t lg:border-t-0 border-zinc-100 dark:border-zinc-800 pt-3 lg:pt-0">
                    {methodsArray.map((method: string, idx: number) => {
                      const m = method.trim();
                      const isPM = m.toLowerCase().includes("pago movil");
                      const isBan = m.toLowerCase().includes("banesco");
                      const color = isPM ? "text-amber-600 bg-amber-50 dark:bg-amber-500/10" : isBan ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10" : "text-zinc-600 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-800";
                      
                      return (
                        <div key={idx} className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${color}`}>
                          <div className="w-1 h-3 inline-block rounded-full mr-1 align-middle bg-current opacity-50" />
                          {m}
                        </div>
                      );
                    })}
                  </div>

                  {/* Action Button (0.8) */}
                  <div className="flex-[0.8] w-full lg:w-auto order-5 mt-2 lg:mt-0">
                    <button 
                      disabled={isMine}
                      onClick={() => { setAmountBs(""); setSelectedMerchant(order); }}
                      className={`w-full px-4 py-2.5 lg:py-2 ${tradeType === 'buy' ? 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white' : 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600 text-white'} font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100`}
                    >
                      {isMine ? 'Tu anuncio' : tradeType === 'buy' ? 'Comprar' : 'Vender'}
                    </button>
                    {order.requiresVerification && (
                      <div className="mt-2 text-center relative group">
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 border-b border-dashed border-zinc-400 dark:border-zinc-600 cursor-help inline-block">
                          Verificación requerida
                        </span>
                        {/* Tooltip */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-3 bg-zinc-800 text-white text-[11px] leading-relaxed rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100]">
                          Para este anuncio, los takers deben proporcionar al maker los documentos adicionales de verificación después de crear las órdenes.
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-zinc-800"></div>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            );
          })}
        </motion.div>
      </motion.div>

      {/* Buy Modal overlay */}
      <AnimatePresence>
        {selectedMerchant && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMerchant(null)}
              className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 100 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 100 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="absolute bottom-0 left-0 md:relative w-full md:max-w-lg bg-white dark:bg-zinc-900 rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl p-6 sm:p-8 overflow-hidden"
            >
              {/* Mobile Drag Handle */}
              <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-6 md:hidden" />
              
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-emerald-500/10 to-transparent pointer-events-none" />
              
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                    {tradeType === 'buy' ? 'Comprar USDT' : 'Vender USDT'}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-zinc-500 text-sm">a</span>
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{selectedMerchant.user?.name || "Anónimo"}</span>
                    {selectedMerchant.user?.kycStatus === "VERIFIED" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedMerchant.user && selectedMerchant.user.id !== myUid && (
                    <button
                      onClick={handleBlockUser}
                      disabled={blocking}
                      className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-full transition-colors"
                      title="Bloquear comerciante"
                    >
                      <Ban className="w-5 h-5" />
                    </button>
                  )}
                  <button 
                    onClick={() => setSelectedMerchant(null)}
                    className="p-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full text-zinc-500 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-6 relative z-10">
                {/* Inputs */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 pl-1 mb-1 flex justify-between">
                      <span>{tradeType === 'buy' ? 'Quiero pagar' : 'Quiero recibir'}</span>
                      <button type="button" onClick={() => setAmountBs(String(selectedMerchant.maxAmount))} className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">Máx.</button>
                    </label>
                    <div className={`relative flex items-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border px-4 py-3 transition-colors focus-within:border-emerald-500 dark:focus-within:border-emerald-400 ${amountOutOfRange ? 'border-rose-400' : 'border-zinc-200 dark:border-zinc-800'}`}>
                      <input 
                        id="p2p-trade-amount"
                        type="number" 
                        value={amountBs}
                        onChange={(e) => setAmountBs(e.target.value)}
                        placeholder={`${selectedMerchant.minAmount} - ${selectedMerchant.maxAmount}`} 
                        className="w-full bg-transparent text-xl font-bold text-zinc-900 dark:text-zinc-50 outline-none"
                      />
                      <span className="font-semibold text-zinc-500 ml-2">VES</span>
                    </div>
                    {amountOutOfRange && (
                      <p className="text-xs text-rose-500 mt-1 pl-1">Límite: {selectedMerchant.minAmount.toLocaleString()} - {selectedMerchant.maxAmount.toLocaleString()} VES</p>
                    )}
                  </div>

                  <div className="flex justify-center -my-1">
                    <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-white dark:border-zinc-900 flex items-center justify-center z-10">
                      <ArrowRight className="w-4 h-4 text-zinc-400 rotate-90" />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 pl-1 mb-1 block">{tradeType === 'buy' ? 'Recibiré aproximadamente' : 'Venderé (se bloqueará en Escrow)'}</label>
                    <div className="relative flex items-center bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 px-4 py-3">
                      <input 
                        type="text" 
                        readOnly
                        value={tradeData.netUsdt > 0 ? tradeData.netUsdt.toFixed(2) : "0.00"} 
                        className="w-full bg-transparent text-xl font-bold text-emerald-600 dark:text-emerald-400 outline-none"
                      />
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 ml-2">USDT</span>
                    </div>
                  </div>
                </div>

                {/* Mathematical Breakdown - Transparent Fees */}
                <div className="bg-zinc-50 dark:bg-zinc-950 rounded-2xl p-5 border border-zinc-100 dark:border-zinc-800/80 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Desglose de la operación</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Tasa de cambio</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{selectedMerchant.price.toFixed(2)} Bs / USDT</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">{tradeType === 'buy' ? 'Monto bruto a recibir' : 'USDT a vender'}</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{tradeData.grossUsdt > 0 ? tradeData.grossUsdt.toFixed(2) : "0.00"} USDT</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                      <span>Comisión del tomador ({feePercentage}%)</span>
                      <AlertCircle className="w-3 h-3" />
                    </div>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">Gratis</span>
                  </div>

                  <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

                  <div className="flex justify-between items-center">
                    <span className="font-bold text-zinc-900 dark:text-zinc-50">{tradeType === 'buy' ? 'Total final a tu billetera' : 'Total que recibirás en tu banco'}</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400 text-lg">
                      {tradeType === 'buy'
                        ? `${tradeData.netUsdt > 0 ? tradeData.netUsdt.toFixed(2) : "0.00"} USDT`
                        : `${!isNaN(amountNum) && amountNum > 0 ? amountNum.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0.00"} VES`}
                    </span>
                  </div>
                </div>

                {/* Feedback Comments */}
                {merchantComments.length > 0 && (
                  <div className="bg-zinc-50 dark:bg-zinc-950 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800/80 space-y-3 max-h-48 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-1 sticky top-0 bg-zinc-50 dark:bg-zinc-950 pb-1">
                      <MessageSquare className="w-4 h-4 text-indigo-500" />
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Últimos comentarios</span>
                    </div>
                    {merchantComments.map((c, idx) => (
                      <div key={idx} className="text-sm border-b border-zinc-200 dark:border-zinc-800 last:border-0 pb-2 last:pb-0 flex gap-3 items-start">
                        {c.rating === "POSITIVE" ? <ThumbsUp className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> : <ThumbsDown className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />}
                        <div>
                          <div className="font-semibold text-zinc-700 dark:text-zinc-300 text-xs">{c.reviewer}</div>
                          <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">{c.comment}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2">
                  <button 
                    disabled={processing || !amountBs || amountOutOfRange}
                    onClick={handleTrade}
                    className={`w-full py-4 disabled:opacity-50 ${tradeType === 'buy' ? 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-400 dark:hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-400 dark:hover:bg-rose-500'} text-white dark:text-zinc-950 font-bold rounded-2xl shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]`}
                  >
                    {processing ? "Procesando..." : `Confirmar ${tradeType === 'buy' ? 'Compra' : 'Venta'}`}
                  </button>
                  <p className="text-center text-xs text-zinc-500 mt-4">
                    Al confirmar, los fondos quedarán en <span className="font-semibold">Escrow seguro</span>.
                  </p>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Error/Success Notifications */}
      <AnimatePresence>
        {(successMessage || errorMessage) && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md"
          >
            <div className={`p-4 rounded-2xl shadow-xl shadow-black/10 border backdrop-blur-md flex items-start gap-3 ${
              successMessage 
                ? 'bg-emerald-500/90 border-emerald-400 text-white' 
                : 'bg-rose-500/90 border-rose-400 text-white'
            }`}>
              <div className="mt-0.5">
                {successMessage ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              </div>
              <div className="flex-1 text-sm font-medium">
                {successMessage || errorMessage}
              </div>
              <button 
                onClick={() => {
                  setSuccessMessage(null);
                  setErrorMessage(null);
                }}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
