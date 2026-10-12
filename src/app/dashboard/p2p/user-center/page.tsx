"use client";

import * as React from "react";
import { motion, Variants, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Check, Edit2, Eye, EyeOff, Plus, AlertCircle, ChevronRight, MoreHorizontal, Search, CreditCard, ThumbsUp, ThumbsDown, UserX, Trophy, X,
  Users, BellRing, BellOff, Loader2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { FollowedMerchantItem } from "@/app/actions/follows";

const containerVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const itemVariants: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } };

type Profile = {
  name: string;
  email: string;
  kycStatus: string;
  vipUntil: string | null;
  memberSince: string;
  firstTradeAt: string | null;
  rank: string;
  rankMeta: { label: string; emoji: string; description: string; color: string };
  orders30d: number;
  completionRate: number | null;
  avgReleaseMin: number | null;
  avgPayMin: number | null;
  totalCompleted: number;
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  buyVolume: number;
  sellVolume: number;
  activeTrades: number;
  disputes: number;
  paymentMethods: number;
  activeAds: number;
  phone?: string;
  paymentMethodsList: { type: string, details?: unknown }[];
  feedbackScore: number | null;
  feedbackPositive: number;
  feedbackNegative: number;
  nextRank: {
    rank: string; label: string; emoji: string;
    requirements: { label: string; current: number; target: number; unit: string; met: boolean }[];
  } | null;
  comments: { id: string; rating: string; comment: string | null; date: string; tradeId: string; reviewer: string }[];
  blockedUsers: { id: string; name: string; blockedAt: string }[];
};

const TAB_PAYMENTS = "Métodos de pago en P2P";
const TAB_COMMENTS = "Comentarios";
const TAB_BLOCKED = "Usuarios bloqueados";
const TAB_FOLLOWS = "Seguidos";

export default function UserCenterPage() {
  const router = useRouter();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [funds, setFunds] = React.useState<{ total: number; available: number } | null>(null);
  const [rate, setRate] = React.useState<number | null>(null);
  const [showBalance, setShowBalance] = React.useState(false);
  const [isVip, setIsVip] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState(TAB_PAYMENTS);
  const [commentFilter, setCommentFilter] = React.useState<"ALL" | "POSITIVE" | "NEGATIVE">("ALL");
  const [unblocking, setUnblocking] = React.useState<string | null>(null);
  const [showVipModal, setShowVipModal] = React.useState(false);
  const [followedMerchants, setFollowedMerchants] = React.useState<FollowedMerchantItem[]>([]);
  const [unfollowing, setUnfollowing] = React.useState<string | null>(null);
  const [togglingNotif, setTogglingNotif] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { getUserCenter } = await import("@/app/actions/p2p");
      const { getWalletOverview } = await import("@/app/actions/funds");
      const { getReferenceRates } = await import("@/app/actions/exchange-rate");
      const { getFollowedMerchants } = await import("@/app/actions/follows");
      const token = await getIdToken();
      const [res, walletRes, ratesRes, followsRes] = await Promise.all([
        getUserCenter(token),
        getWalletOverview(token),
        getReferenceRates(),
        getFollowedMerchants(token),
      ]);
      if (res.success) {
        setProfile(res.profile as unknown as Profile);
        setIsVip(Boolean(res.profile.vipUntil && new Date(res.profile.vipUntil).getTime() > Date.now()));
      } else {
        setError(res.error);
      }
      if (walletRes.success) setFunds({ total: walletRes.total, available: walletRes.available });
      if (ratesRes) setRate(ratesRes.roraima ?? ratesRes.binance ?? ratesRes.parallel ?? ratesRes.bcv ?? null);
      if (followsRes?.success) setFollowedMerchants(followsRes.merchants);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar tu perfil");
    }
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const handleUnblock = async (userId: string) => {
    setUnblocking(userId);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { unblockUser } = await import("@/app/actions/blacklist");
      const res = await unblockUser(await getIdToken(), userId);
      if (res.success) {
        setProfile((p) => (p ? { ...p, blockedUsers: p.blockedUsers.filter((b) => b.id !== userId) } : p));
      }
    } finally {
      setUnblocking(null);
    }
  };

  const handleToggleFollowNotif = async (targetUserId: string) => {
    setTogglingNotif(targetUserId);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { toggleFollowNotification } = await import("@/app/actions/follows");
      const res = await toggleFollowNotification(await getIdToken(), targetUserId);
      if (res.success) {
        setFollowedMerchants((list) =>
          list.map((m) => (m.id === targetUserId ? { ...m, notifyOnAd: res.notifyOnAd } : m))
        );
        if (res.notifyOnAd) toast.success("Alertas activadas para este comerciante");
        else toast.info("Alertas silenciadas para este comerciante");
      } else {
        toast.error(res.error || "No se pudo actualizar");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setTogglingNotif(null);
    }
  };

  const handleUnfollow = async (targetUserId: string) => {
    setUnfollowing(targetUserId);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { unfollowMerchant } = await import("@/app/actions/follows");
      const res = await unfollowMerchant(await getIdToken(), targetUserId);
      if (res.success) {
        setFollowedMerchants((list) => list.filter((m) => m.id !== targetUserId));
        toast.success("Has dejado de seguir a este comerciante");
      } else {
        toast.error(res.error || "No se pudo dejar de seguir");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setUnfollowing(null);
    }
  };

  if (error) return <div className="p-8 text-rose-500 text-sm text-center">{error}</div>;
  if (!profile) return <div className="p-12 text-center text-zinc-500 animate-pulse">Cargando centro de usuario...</div>;

  const totalFeedback = profile.feedbackPositive + profile.feedbackNegative;
  const filteredComments = profile.comments.filter((c) => commentFilter === "ALL" || c.rating === commentFilter);

  const tabs = [
    { key: TAB_PAYMENTS, label: TAB_PAYMENTS },
    { key: TAB_COMMENTS, label: `Comentarios (${totalFeedback})` },
    { key: TAB_BLOCKED, label: `Usuarios bloqueados (${profile.blockedUsers.length})` },
    { key: TAB_FOLLOWS, label: `Seguidos (${followedMerchants.length})` },
    { key: "Centro de eliminación de restricciones", label: "Centro de eliminación de restricciones" },
    { key: "Ajustes de notificaciones", label: "Ajustes de notificaciones" },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 pb-20">
      
      {/* Banner / Header (Binance Style) */}
      <div className="w-full bg-[#181a20] h-48 relative overflow-hidden flex items-center px-4 sm:px-8">
        {/* Background glow similar to Binance */}
        <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 to-transparent"></div>
        <div className="absolute top-0 right-0 w-1/2 h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-yellow-500/20 via-[#181a20]/0 to-transparent opacity-50"></div>
        
        <div className="max-w-6xl w-full mx-auto relative z-10 flex justify-end">
          {isVip ? (
            <div className="px-5 py-2.5 bg-[#fcd535]/20 border border-[#fcd535] text-[#fcd535] font-semibold text-sm rounded flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Comerciante VIP Verificado
            </div>
          ) : (
            <button 
              onClick={() => setShowVipModal(true)}
              className="px-5 py-2.5 bg-[#fcd535] hover:bg-[#f0c828] text-black font-semibold text-sm rounded transition-colors"
            >
              Hazte Premium (Comerciante VIP)
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-10 relative z-20">
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8">
          
          {/* Top Profile Info */}
          <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white dark:bg-zinc-950">
            <div className="flex items-end gap-4">
              {/* Avatar */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-zinc-900 text-white flex items-center justify-center text-2xl font-semibold border-4 border-white dark:border-zinc-950 shadow-sm">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                {profile.kycStatus === "VERIFIED" && (
                  <div className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white dark:border-zinc-950 flex items-center justify-center" title="KYC Básico">
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                )}
                {isVip && (
                  <div className="absolute -top-2 -right-2 w-7 h-7 bg-[#fcd535] rounded-full border-2 border-white dark:border-zinc-950 flex items-center justify-center shadow-lg" title="Comerciante VIP">
                    <Trophy className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
                  </div>
                )}
              </div>
              
              {/* Name & Badges */}
              <div className="mb-1">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{profile.name}</h1>
                  <span
                    title={profile.rankMeta.description}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border"
                    style={{ color: profile.rankMeta.color, borderColor: `${profile.rankMeta.color}55`, backgroundColor: `${profile.rankMeta.color}15` }}
                  >
                    {profile.rankMeta.emoji} {profile.rankMeta.label}
                  </span>
                  <button className="text-zinc-400 hover:text-zinc-600 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-emerald-500">
                  <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Email</span>
                  <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> SMS</span>
                  <span className={`flex items-center gap-1 ${profile.kycStatus === "VERIFIED" ? "text-emerald-500" : "text-zinc-400"}`}>
                    <Check className="w-3.5 h-3.5" /> KYC
                  </span>
                </div>
              </div>
            </div>

            {/* Funds Value */}
            <div className="mb-2">
              <div className="flex items-center justify-end gap-2 text-sm text-zinc-500 mb-1">
                <span>Valor de la cuenta de Fondos</span>
                <button
                  type="button"
                  id="toggle-funds-balance-btn"
                  onClick={() => setShowBalance((prev) => !prev)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-0.5 rounded cursor-pointer"
                  title={showBalance ? "Ocultar balance" : "Mostrar balance"}
                >
                  {showBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
              <Link
                href="/dashboard/wallets"
                className="flex items-center justify-end gap-2 group hover:opacity-85 transition-opacity"
                title="Ir a mis billeteras de fondos"
              >
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
                  {showBalance ? `${(funds?.total ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT` : "••••••••"}
                </span>
                <span className="text-xs text-zinc-400 font-medium flex items-center">
                  {showBalance && rate
                    ? `≈ ${((funds?.total ?? 0) * rate).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES`
                    : showBalance ? "" : "••••••••"}
                  <ChevronRight className="w-3.5 h-3.5 inline ml-1 text-zinc-400 group-hover:translate-x-0.5 group-hover:text-emerald-500 transition-all" />
                </span>
              </Link>
            </div>
          </motion.div>

          {/* Rango de comerciante y progreso */}
          <motion.div
            variants={itemVariants}
            className="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6"
            style={{ background: `linear-gradient(135deg, ${profile.rankMeta.color}14 0%, transparent 60%)` }}
          >
            <div className="flex flex-col lg:flex-row gap-6 lg:items-center">
              <div className="flex items-center gap-4 lg:w-80 shrink-0">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-sm"
                  style={{ backgroundColor: `${profile.rankMeta.color}22`, boxShadow: `0 0 0 1px ${profile.rankMeta.color}44` }}
                >
                  {profile.rankMeta.emoji}
                </div>
                <div>
                  <div className="text-xs text-zinc-500 flex items-center gap-1"><Trophy className="w-3.5 h-3.5" /> Tu rango P2P</div>
                  <div className="text-lg font-bold" style={{ color: profile.rankMeta.color }}>Comerciante {profile.rankMeta.label}</div>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-snug">{profile.rankMeta.description}</p>
                </div>
              </div>

              {profile.nextRank ? (
                <div className="flex-1">
                  <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-3">
                    Próximo rango: <span className="font-bold">{profile.nextRank.emoji} {profile.nextRank.label}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {profile.nextRank.requirements.map((r) => {
                      const pct = Math.min(100, r.target > 0 ? (r.current / r.target) * 100 : 100);
                      return (
                        <div key={r.label}>
                          <div className="flex justify-between text-[11px] mb-1.5">
                            <span className="text-zinc-500">{r.label}</span>
                            <span className={r.met ? "text-emerald-500 font-semibold" : "text-zinc-700 dark:text-zinc-300 font-medium"}>
                              {r.current}{r.unit} / {r.target}{r.unit}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                              className={`h-full rounded-full ${r.met ? "bg-emerald-500" : "bg-[#fcd535]"}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 text-sm font-medium text-violet-500">🎉 Has alcanzado el rango máximo. ¡Eres de los comerciantes más confiables de Roraima!</div>
              )}
            </div>
          </motion.div>
          <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-zinc-900/50 p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center text-center">
              <div className="text-xs text-zinc-500 mb-2 whitespace-nowrap">Comercios últ. 30d</div>
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {profile.orders30d} <span className="text-sm font-normal text-zinc-500">Comercio(s)</span>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/50 p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center text-center">
              <div className="text-xs text-zinc-500 mb-2">Promedio de finalización últ. 30d</div>
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {profile.completionRate != null ? `${profile.completionRate}%` : "—"}
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/50 p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center text-center">
              <div className="text-xs text-zinc-500 mb-2">Tiempo promedio de liberación</div>
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {profile.avgReleaseMin != null ? profile.avgReleaseMin : "—"} <span className="text-sm font-normal text-zinc-500">Minuto(s)</span>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/50 p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center text-center">
              <div className="text-xs text-zinc-500 mb-2">Tiempo promedio de pago</div>
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {profile.avgPayMin != null ? profile.avgPayMin : "—"} <span className="text-sm font-normal text-zinc-500">Minuto(s)</span>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/50 p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center text-center relative group cursor-pointer">
              <div className="text-xs text-zinc-500 mb-2">Comentarios positivos</div>
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                {profile.feedbackScore != null ? `${profile.feedbackScore.toFixed(2)}%` : "—"}
              </div>
              <div className="text-xs font-medium">
                <span className="text-emerald-500">Positivo {profile.feedbackPositive}</span> <span className="text-zinc-300">/</span> <span className="text-rose-500">Negativo {profile.feedbackNegative}</span>
              </div>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="w-5 h-5 text-zinc-400" />
              </div>
            </div>
          </motion.div>

          {/* Tabs Menu */}
          <motion.div variants={itemVariants}>
            <div className="flex overflow-x-auto no-scrollbar gap-8 border-b border-zinc-200 dark:border-zinc-800 mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`pb-4 text-sm font-medium whitespace-nowrap transition-colors relative ${
                    activeTab === tab.key ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <motion.div layoutId="userCenterTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#fcd535]" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content: Métodos de pago */}
            {activeTab === TAB_PAYMENTS && (
              <div className="animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <p className="text-xs text-zinc-500 max-w-2xl leading-relaxed">
                    Métodos de pago P2P: cuando venda criptomonedas, el método de pago agregado se mostrará al comprador como múltiples opciones para aceptar el pago, asegúrese de que el nombre del propietario de la cuenta sea igual a su nombre verificado. Puede agregar hasta 20 métodos de pago.
                  </p>
                  <button onClick={() => router.push("/dashboard/p2p/payment-methods")} className="shrink-0 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-50 text-sm font-medium rounded transition-colors flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Agregar un método de pago
                  </button>
                </div>

                {/* List of Payment Methods */}
                {profile.paymentMethods > 0 ? (
                  <div className="space-y-4">
                    {/* Simulated view - since we only have count, we show a button to manage them */}
                    <div className="p-6 border border-zinc-200 dark:border-zinc-800 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-1 bg-[#fcd535] h-5 rounded-full"></div>
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">Tienes {profile.paymentMethods} método(s) configurado(s)</span>
                      </div>
                      <button onClick={() => router.push("/dashboard/p2p/payment-methods")} className="text-sm font-medium text-[#c99400] hover:text-[#f0c828] transition-colors">
                        Gestionar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center justify-center text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <div className="w-16 h-16 bg-zinc-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                      <CreditCard className="w-6 h-6 text-zinc-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Aún no has agregado métodos de pago</h3>
                    <p className="text-xs text-zinc-500 mb-4">Agrega uno para comenzar a vender tus criptomonedas.</p>
                  </div>
                )}
              </div>
            )}
            
            {/* Tab Content: Comentarios recibidos */}
            {activeTab === TAB_COMMENTS && (
              <div className="animate-in fade-in duration-300">
                <div className="flex gap-2 mb-5">
                  {([
                    ["ALL", `Todos (${totalFeedback})`],
                    ["POSITIVE", `Positivos (${profile.feedbackPositive})`],
                    ["NEGATIVE", `Negativos (${profile.feedbackNegative})`],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setCommentFilter(key)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        commentFilter === key
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {filteredComments.length === 0 ? (
                  <div className="py-16 text-center">
                    <ThumbsUp className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                    <p className="text-sm text-zinc-500">Aún no tienes comentarios. Completa órdenes P2P para recibir calificaciones.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    {filteredComments.map((c) => (
                      <div key={c.id} className="p-4 flex gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${c.rating === "POSITIVE" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                          {c.rating === "POSITIVE" ? <ThumbsUp className="w-4 h-4" /> : <ThumbsDown className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.reviewer}</span>
                            <span className="text-[11px] text-zinc-400">{new Date(c.date).toLocaleString("es-VE")}</span>
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5 break-words">
                            {c.comment || <span className="italic text-zinc-400">Sin comentario escrito</span>}
                          </p>
                          <Link href={`/dashboard/p2p/trade/${c.tradeId}`} className="text-[11px] text-[#c99400] hover:underline mt-1 inline-block">
                            Orden #{c.tradeId.slice(0, 8)}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab Content: Usuarios bloqueados */}
            {activeTab === TAB_BLOCKED && (
              <div className="animate-in fade-in duration-300">
                <p className="text-xs text-zinc-500 mb-5 max-w-2xl">
                  Los usuarios bloqueados no verán tus anuncios y tú no verás los suyos. No podrán abrir órdenes contigo.
                </p>
                {profile.blockedUsers.length === 0 ? (
                  <div className="py-16 text-center">
                    <UserX className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                    <p className="text-sm text-zinc-500">No has bloqueado a ningún usuario.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    {profile.blockedUsers.map((b) => (
                      <div key={b.id} className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                            {b.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <Link href={`/dashboard/p2p/user/${b.id}`} className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:underline">{b.name}</Link>
                            <div className="text-[11px] text-zinc-400">Bloqueado el {new Date(b.blockedAt).toLocaleDateString("es-VE")}</div>
                          </div>
                        </div>
                        <button
                          id={`unblock-${b.id}`}
                          disabled={unblocking === b.id}
                          onClick={() => handleUnblock(b.id)}
                          className="px-3 py-1.5 text-xs font-medium rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                        >
                          {unblocking === b.id ? "Desbloqueando..." : "Desbloquear"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab Content: Seguidos */}
            {activeTab === TAB_FOLLOWS && (
              <div className="animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <p className="text-xs text-zinc-500 max-w-2xl">
                    Comerciantes que sigues en el mercado P2P. Puedes configurar alertas para recibir notificaciones automáticas cada vez que publiquen un nuevo anuncio.
                  </p>
                  <Link
                    href="/dashboard/p2p"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline self-start sm:self-auto"
                  >
                    <span>Explorar mercado P2P</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {followedMerchants.length === 0 ? (
                  <div className="py-16 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-8">
                    <Users className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1">Aún no sigues a ningún comerciante</h3>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto mb-5">
                      Sigue a tus comerciantes favoritos para recibir notificaciones en tiempo real al instante de que publiquen nuevos anuncios de compra o venta.
                    </p>
                    <Link
                      href="/dashboard/p2p"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
                    >
                      <span>Ir al mercado P2P</span>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {followedMerchants.map((m) => (
                      <div
                        key={m.id}
                        className="p-5 rounded-2xl bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 flex flex-col justify-between gap-4 transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white font-bold text-base shadow-sm">
                                {m.name.charAt(0).toUpperCase()}
                              </div>
                              {m.kycStatus === "VERIFIED" && (
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-white dark:border-zinc-900">
                                  <Check className="w-2.5 h-2.5 text-white" />
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  href={`/dashboard/p2p/user/${m.id}`}
                                  className="text-sm font-bold text-zinc-900 dark:text-zinc-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                                >
                                  {m.name}
                                </Link>
                                {m.kycStatus === "VERIFIED" && (
                                  <span className="text-[10px] text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold">
                                    KYC
                                  </span>
                                )}
                                {m.isVip && (
                                  <span className="text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                                    <Trophy className="w-2.5 h-2.5" /> VIP
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-400 mt-0.5">
                                Siguiendo desde el {new Date(m.followedAt).toLocaleDateString("es-VE")}
                              </div>
                            </div>
                          </div>

                          <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${
                            m.activeAdsCount > 0
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                          }`}>
                            {m.activeAdsCount} {m.activeAdsCount === 1 ? "anuncio activo" : "anuncios activos"}
                          </span>
                        </div>

                        {/* Recent Ads Preview */}
                        {m.activeAds.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/80">
                            {m.activeAds.slice(0, 3).map((ad) => (
                              <span
                                key={ad.id}
                                className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                                  ad.type === "SELL"
                                    ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400"
                                    : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                {ad.type === "SELL" ? "Venta" : "Compra"}: {ad.price.toFixed(2)} VES
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Controls */}
                        <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/80">
                          <button
                            id={`toggle-notif-${m.id}`}
                            disabled={togglingNotif === m.id}
                            onClick={() => handleToggleFollowNotif(m.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                              m.notifyOnAd
                                ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 shadow-sm"
                                : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                            }`}
                            title={m.notifyOnAd ? "Alertas activadas (recibirás notificación al publicar). Clic para silenciar." : "Silenciado. Clic para activar alertas."}
                          >
                            {togglingNotif === m.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : m.notifyOnAd ? (
                              <>
                                <BellRing className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                                <span>Alertas ON</span>
                              </>
                            ) : (
                              <>
                                <BellOff className="w-3.5 h-3.5 text-zinc-400" />
                                <span>Alertas OFF</span>
                              </>
                            )}
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              id={`unfollow-${m.id}`}
                              disabled={unfollowing === m.id}
                              onClick={() => handleUnfollow(m.id)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
                            >
                              {unfollowing === m.id ? "Dejando de seguir..." : "Dejar de seguir"}
                            </button>

                            <Link
                              href={`/dashboard/p2p/user/${m.id}`}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
                            >
                              Ver perfil
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Other empty tabs */}
            {![TAB_PAYMENTS, TAB_COMMENTS, TAB_BLOCKED, TAB_FOLLOWS].includes(activeTab) && (
              <div className="py-16 text-center animate-in fade-in duration-300">
                <Search className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">No hay datos para mostrar</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showVipModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#fcd535]/10 rounded-full blur-3xl" />
              <button onClick={() => setShowVipModal(false)} className="absolute top-4 right-4 p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors z-10">
                <X className="w-5 h-5" />
              </button>
              
              <div className="relative z-10">
                <div className="w-14 h-14 bg-[#fcd535]/20 text-[#fcd535] rounded-2xl flex items-center justify-center mb-6">
                  <Trophy className="w-7 h-7" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Comerciante VIP</h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
                  Destaca en el mercado P2P. Tus anuncios aparecerán de primeros y obtendrás la insignia de Comerciante Verificado. Costo: <strong className="text-zinc-900 dark:text-zinc-100">25 USDT / mes</strong>.
                </p>

                <form action={async (fd) => {
                  const { getIdToken } = await import("@/lib/client-auth");
                  const { purchaseVipMembership } = await import("@/app/actions/vip");
                  fd.append("idToken", await getIdToken());
                  
                  const btn = document.getElementById("btn-vip-submit") as HTMLButtonElement;
                  if (btn) { btn.disabled = true; btn.innerText = "Procesando..."; }
                  
                  const res = await purchaseVipMembership(fd);
                  if (res.success) {
                    window.location.reload();
                  } else {
                    alert(res.error);
                    if (btn) { btn.disabled = false; btn.innerText = "Pagar 25 USDT e Iniciar"; }
                  }
                }} className="space-y-4">
                  
                  <div>
                    <label className="block text-sm font-semibold mb-1.5 text-zinc-800 dark:text-zinc-200">Comprobante de RIF (PDF o Imagen)</label>
                    <input type="file" name="rif" required accept="image/*,.pdf" className="w-full border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-950 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#fcd535] file:text-black hover:file:bg-[#f0c828]" />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-1.5 text-zinc-800 dark:text-zinc-200">Referencia Bancaria (PDF o Imagen)</label>
                    <input type="file" name="bankRef" required accept="image/*,.pdf" className="w-full border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-950 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#fcd535] file:text-black hover:file:bg-[#f0c828]" />
                  </div>

                  <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 p-4 rounded-xl text-xs flex gap-3 mt-6">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p>Al continuar, se descontarán <strong>25 USDT</strong> de tu billetera de Roraima. Si tu membresía vence y no renuevas, perderás los beneficios. La cuenta debe coincidir con tus datos.</p>
                  </div>

                  <button id="btn-vip-submit" type="submit" className="w-full py-3.5 bg-[#fcd535] hover:bg-[#f0c828] text-black font-bold rounded-xl mt-6 transition-colors shadow-lg shadow-[#fcd535]/20">
                    Pagar 25 USDT e Iniciar
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
