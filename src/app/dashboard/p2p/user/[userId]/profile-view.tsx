"use client";

import * as React from "react";
import { motion, Variants } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, BadgeCheck, ShieldAlert, CheckCircle2, Loader2, Shield, Mail, Phone, MapPin,
  TrendingUp, TrendingDown, Timer, Clock, BarChart3, Gem, ChevronDown, ChevronUp,
  UserPlus, UserMinus, UserCheck, Bell, BellRing, BellOff, Check,
} from "lucide-react";
import { toast } from "sonner";

const containerVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const itemVariants: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } };

const RANK_COLORS: Record<string, { bg: string; text: string; glow: string; border: string }> = {
  HIERRO:   { bg: "bg-zinc-600/10", text: "text-zinc-500", glow: "shadow-zinc-500/10", border: "border-zinc-400/30" },
  BRONCE:   { bg: "bg-amber-700/10", text: "text-amber-700 dark:text-amber-400", glow: "shadow-amber-700/20", border: "border-amber-500/30" },
  PLATA:    { bg: "bg-slate-400/10", text: "text-slate-500 dark:text-slate-300", glow: "shadow-slate-400/20", border: "border-slate-400/30" },
  ORO:      { bg: "bg-yellow-500/10", text: "text-yellow-700 dark:text-yellow-400", glow: "shadow-yellow-500/30", border: "border-yellow-500/30" },
  DIAMANTE: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", glow: "shadow-violet-500/30", border: "border-violet-500/30" },
};

type Profile = Awaited<ReturnType<typeof import("@/app/actions/p2p").getPublicP2PProfile>> extends { profile: infer P } ? P : never;

export default function ProfileView() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const [profile, setProfile] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showBuyAds, setShowBuyAds] = React.useState(true);
  const [showSellAds, setShowSellAds] = React.useState(true);
  const [isFollowing, setIsFollowing] = React.useState(false);
  const [notifyOnAd, setNotifyOnAd] = React.useState(false);
  const [followersCount, setFollowersCount] = React.useState(0);
  const [followLoading, setFollowLoading] = React.useState(false);
  const [notifLoading, setNotifLoading] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const { getIdToken } = await import("@/lib/client-auth");
        const { getPublicP2PProfile } = await import("@/app/actions/p2p");
        const res = await getPublicP2PProfile(await getIdToken(), userId);
        if (res.success) {
          setProfile(res.profile);
          setIsFollowing(Boolean(res.profile.isFollowing));
          setNotifyOnAd(Boolean(res.profile.notifyOnAd));
          setFollowersCount(res.profile.followersCount ?? 0);
        } else {
          setError(res.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar el perfil");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const handleToggleFollow = async () => {
    setFollowLoading(true);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { followMerchant, unfollowMerchant } = await import("@/app/actions/follows");
      const token = await getIdToken();
      if (isFollowing) {
        const res = await unfollowMerchant(token, userId);
        if (res.success) {
          setIsFollowing(false);
          setNotifyOnAd(false);
          setFollowersCount(res.followersCount);
          toast.success("Has dejado de seguir a este comerciante");
        } else {
          toast.error(res.error || "No se pudo actualizar");
        }
      } else {
        const res = await followMerchant(token, userId, true);
        if (res.success) {
          setIsFollowing(true);
          setNotifyOnAd(true);
          setFollowersCount(res.followersCount);
          toast.success("¡Ahora sigues a este comerciante! Recibirás notificaciones cuando publique anuncios.");
        } else {
          toast.error(res.error || "No se pudo seguir al comerciante");
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setFollowLoading(false);
    }
  };

  const handleToggleNotif = async () => {
    setNotifLoading(true);
    try {
      const { getIdToken } = await import("@/lib/client-auth");
      const { toggleFollowNotification } = await import("@/app/actions/follows");
      const token = await getIdToken();
      const res = await toggleFollowNotification(token, userId);
      if (res.success) {
        setNotifyOnAd(res.notifyOnAd);
        if (res.notifyOnAd) {
          toast.success("Alertas activadas cuando publique nuevos anuncios");
        } else {
          toast.info("Alertas silenciadas para este comerciante");
        }
      } else {
        toast.error(res.error || "No se pudo actualizar la preferencia");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setNotifLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Error</h1>
        <p className="text-zinc-500 mb-6">{error || "Perfil no encontrado"}</p>
        <button onClick={() => router.back()} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-colors">Volver</button>
      </div>
    );
  }

  const rc = RANK_COLORS[profile.rank] || RANK_COLORS.HIERRO;
  const memberDate = new Date(profile.memberSince).toLocaleDateString("es-VE", { year: "numeric", month: "long", day: "numeric" });

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
          <ArrowLeft className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
        </button>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Perfil del Comerciante</h1>
      </motion.div>

      {/* Rank Tooltip Banner */}
      <motion.div variants={itemVariants} className={`flex items-start gap-3 p-4 rounded-2xl border ${rc.border} ${rc.bg}`}>
        <span className="text-2xl">{profile.rankMeta.emoji}</span>
        <div>
          <span className={`font-bold text-sm ${rc.text}`}>Comerciante {profile.rankMeta.label}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 block mt-0.5">{profile.rankMeta.description}</span>
        </div>
      </motion.div>

      {/* Profile Card */}
      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 sm:p-8 shadow-sm border border-zinc-100 dark:border-zinc-800/60">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white font-bold text-3xl shadow-lg">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              {profile.kycStatus === "VERIFIED" && (
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-white dark:border-zinc-900">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{profile.name}</h2>
                {profile.kycStatus === "VERIFIED" && (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> Verificado</span>
                )}
                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md ${rc.text} ${rc.bg}`}>
                  {profile.rankMeta.emoji} {profile.rankMeta.label}
                </span>
              </div>
              <p className="text-sm text-zinc-500 mt-1">Se unió el {memberDate}</p>
            </div>
          </div>

          {/* Follow Actions */}
          <div className="flex flex-wrap items-center gap-2.5 self-stretch sm:self-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
            {profile.isSelf ? (
              <span className="text-xs px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-semibold">
                Tu perfil público
              </span>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-750 px-3 py-2 rounded-xl">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{followersCount} {followersCount === 1 ? "seguidor" : "seguidores"}</span>
                </div>

                {isFollowing ? (
                  <div className="flex items-center gap-2">
                    <button
                      id="btn-toggle-notif"
                      disabled={notifLoading}
                      onClick={handleToggleNotif}
                      className={`px-3 py-2 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold ${
                        notifyOnAd
                          ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/80 text-amber-700 dark:text-amber-300 shadow-sm"
                          : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                      }`}
                      title={notifyOnAd ? "Alertas activadas (recibirás notificación al publicar). Clic para silenciar." : "Silenciado. Clic para activar notificaciones de anuncios."}
                    >
                      {notifLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : notifyOnAd ? (
                        <>
                          <BellRing className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                          <span>Alertas activas</span>
                        </>
                      ) : (
                        <>
                          <BellOff className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Sin alertas</span>
                        </>
                      )}
                    </button>

                    <button
                      id="btn-unfollow"
                      disabled={followLoading}
                      onClick={handleToggleFollow}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold text-xs hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:border-rose-800 dark:hover:text-rose-400 group transition-all disabled:opacity-50"
                      title="Clic para dejar de seguir"
                    >
                      {followLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5 group-hover:hidden text-emerald-600 dark:text-emerald-400" />
                          <UserMinus className="w-3.5 h-3.5 hidden group-hover:block" />
                          <span className="group-hover:hidden">Siguiendo</span>
                          <span className="hidden group-hover:inline">Dejar de seguir</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    id="btn-follow"
                    disabled={followLoading}
                    onClick={handleToggleFollow}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {followLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    <span>Seguir</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Verification Badges */}
        <div className="flex flex-wrap gap-3 mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800">
          {[
            { icon: Mail, label: "Email", ok: profile.verified.email },
            { icon: Shield, label: "Verificación de ID", ok: profile.verified.id },
            { icon: Phone, label: "Teléfono", ok: profile.verified.phone },
            { icon: MapPin, label: "Dirección", ok: profile.verified.address },
          ].map((v) => (
            <span
              key={v.label}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${
                v.ok
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
              }`}
            >
              {v.ok && <CheckCircle2 className="w-3 h-3" />}
              <v.icon className="w-3 h-3" />
              {v.label}
            </span>
          ))}
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Todos los comercios", value: String(profile.totalCompleted), sub: "Comercio(s)" },
          { label: "Comercios últ. 30d", value: String(profile.orders30d), sub: "Comercio(s)" },
          { label: "Promedio de finalización últ. 30d", value: profile.completionRate != null ? `${profile.completionRate}%` : "—", sub: null },
          { label: "Tiempo promedio de liberación", value: profile.avgReleaseMin != null ? `${profile.avgReleaseMin}` : "—", sub: "Minuto(s)" },
          { label: "Tiempo promedio de pago", value: profile.avgPayMin != null ? `${profile.avgPayMin}` : "—", sub: "Minuto(s)" },
        ].map((s, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-100 dark:border-zinc-800/60 text-center"
          >
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mb-2 leading-tight">{s.label}</div>
            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{s.value}</div>
            {s.sub && <div className="text-[11px] text-zinc-400 mt-0.5">{s.sub}</div>}
          </motion.div>
        ))}
      </div>

      {/* Buy/Sell Volume */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-100 dark:border-zinc-800/60 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <div className="text-sm text-zinc-500 font-medium">Compras completadas</div>
            <div className="text-xl font-black text-zinc-900 dark:text-zinc-50">{profile.buyCount} · {profile.buyVolume.toFixed(2)} USDT</div>
          </div>
        </motion.div>
        <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-100 dark:border-zinc-800/60 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
            <TrendingDown className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <div className="text-sm text-zinc-500 font-medium">Ventas completadas</div>
            <div className="text-xl font-black text-zinc-900 dark:text-zinc-50">{profile.sellCount} · {profile.sellVolume.toFixed(2)} USDT</div>
          </div>
        </motion.div>
      </div>

      {/* Sell Ads (Anuncios de venta) */}
      {profile.sellAds.length > 0 && (
        <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800/60 overflow-hidden">
          <button
            onClick={() => setShowSellAds(!showSellAds)}
            className="w-full flex items-center justify-between px-6 py-5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="font-bold text-zinc-900 dark:text-zinc-50 text-left">
              Anuncios de venta activos
              <span className="text-xs font-normal text-zinc-400 ml-2">({profile.sellAds.length})</span>
            </div>
            {showSellAds ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
          </button>
          {showSellAds && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-950/50 border-t border-b border-zinc-100 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-zinc-500">Moneda</th>
                    <th className="px-6 py-3 font-semibold text-zinc-500">Precio</th>
                    <th className="px-6 py-3 font-semibold text-zinc-500">Límite de la orden / Disponible</th>
                    <th className="px-6 py-3 font-semibold text-zinc-500">Pago</th>
                    <th className="px-6 py-3 font-semibold text-zinc-500">Trade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {profile.sellAds.map((ad: any) => (
                    <tr key={ad.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">T</div>
                          <span className="font-bold text-zinc-900 dark:text-zinc-50">USDT</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-zinc-900 dark:text-zinc-50">{ad.price.toLocaleString("es-VE")} VES</td>
                      <td className="px-6 py-4">
                        <div className="text-zinc-600 dark:text-zinc-300">{ad.available.toFixed(2)} USDT</div>
                        <div className="text-xs text-zinc-400">Bs{ad.minAmount.toLocaleString("es-VE")} – Bs{ad.maxAmount.toLocaleString("es-VE")}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {ad.methods.split(",").map((m: string, i: number) => (
                            <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">{m.trim()}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => router.push(`/dashboard/p2p`)}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-sm transition-colors"
                        >
                          Comprar USDT
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* Buy Ads (Anuncios de compra) */}
      {profile.buyAds.length > 0 && (
        <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800/60 overflow-hidden">
          <button
            onClick={() => setShowBuyAds(!showBuyAds)}
            className="w-full flex items-center justify-between px-6 py-5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="font-bold text-zinc-900 dark:text-zinc-50 text-left">
              Anuncios de compra activos
              <span className="text-xs font-normal text-zinc-400 ml-2">({profile.buyAds.length})</span>
            </div>
            {showBuyAds ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
          </button>
          {showBuyAds && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-950/50 border-t border-b border-zinc-100 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-zinc-500">Moneda</th>
                    <th className="px-6 py-3 font-semibold text-zinc-500">Precio</th>
                    <th className="px-6 py-3 font-semibold text-zinc-500">Límite / Disponible</th>
                    <th className="px-6 py-3 font-semibold text-zinc-500">Pago</th>
                    <th className="px-6 py-3 font-semibold text-zinc-500">Trade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {profile.buyAds.map((ad: any) => (
                    <tr key={ad.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">T</div>
                          <span className="font-bold text-zinc-900 dark:text-zinc-50">USDT</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-zinc-900 dark:text-zinc-50">{ad.price.toLocaleString("es-VE")} VES</td>
                      <td className="px-6 py-4">
                        <div className="text-zinc-600 dark:text-zinc-300">{ad.available.toFixed(2)} USDT</div>
                        <div className="text-xs text-zinc-400">Bs{ad.minAmount.toLocaleString("es-VE")} – Bs{ad.maxAmount.toLocaleString("es-VE")}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {ad.methods.split(",").map((m: string, i: number) => (
                            <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">{m.trim()}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => router.push(`/dashboard/p2p`)}
                          className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-lg text-sm transition-colors"
                        >
                          Vender USDT
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* Empty state */}
      {profile.sellAds.length === 0 && profile.buyAds.length === 0 && (
        <motion.div variants={itemVariants} className="text-center py-12 bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800/60">
          <BarChart3 className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Este usuario no tiene anuncios activos en este momento.</p>
        </motion.div>
      )}
    </motion.div>
  );
}
