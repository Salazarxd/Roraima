"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  Wallet, 
  Clock, 
  Bell, 
  Shield, 
  Settings, 
  MoreHorizontal,
  Gavel,
  LifeBuoy,
  LogOut,
  X,
  CheckCheck,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Inbox,
  Gift
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { waitForUser } from "@/lib/client-auth";
import { ThemeToggle } from "./theme-toggle";
import { NotificationToggle } from "./notification-toggle";
import { ReferralProgramModal } from "./referral-program-modal";
import type { NotificationItem } from "@/app/actions/account";

const SEEN_KEY = "roraima:notifications:lastSeen";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Ahora";
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-VE", { dateStyle: "short" });
}

function notifIcon(kind: NotificationItem["kind"]) {
  switch (kind) {
    case "TRADE":
      return { Icon: ArrowLeftRight, cls: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" };
    case "DEPOSIT":
      return { Icon: ArrowDownLeft, cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" };
    case "WITHDRAWAL":
      return { Icon: ArrowUpRight, cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" };
    case "WALLET":
      return { Icon: Wallet, cls: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/20" };
    default:
      return { Icon: Bell, cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20" };
  }
}

type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
  exact?: boolean;
};

export function DockNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeCount, setActiveCount] = React.useState(0);
  const [showMore, setShowMore] = React.useState(false);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [showReferralModal, setShowReferralModal] = React.useState(false);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [loadingNotifs, setLoadingNotifs] = React.useState(false);
  const [lastSeen, setLastSeen] = React.useState<string>("");
  const [staffRole, setStaffRole] = React.useState<"ADMIN" | "SUPPORT" | null>(null);
  const [hoveredItem, setHoveredItem] = React.useState<string | null>(null);

  // Carga de notificaciones
  const loadNotifications = React.useCallback(async () => {
    try {
      setLoadingNotifs(true);
      const u = await waitForUser();
      if (!u) return;
      const { getIdToken } = await import("@/lib/client-auth");
      const { getNotifications } = await import("@/app/actions/account");
      const res = await getNotifications(await getIdToken());
      if (res.success) {
        setNotifications(res.items);
      }
    } catch {
      // Silencioso
    } finally {
      setLoadingNotifs(false);
    }
  }, []);

  // Consultar rol de staff y órdenes activas
  React.useEffect(() => {
    let cancelled = false;

    const checkData = async () => {
      const u = await waitForUser();
      if (!u || cancelled) return;
      try {
        const token = await u.getIdToken();
        const [{ getStaffSession }, { fetchMyTrades }] = await Promise.all([
          import("@/app/actions/admin"),
          import("@/app/actions/p2p"),
        ]);

        const [staffRes, tradesRes] = await Promise.all([
          getStaffSession(token),
          fetchMyTrades(token),
        ]);

        if (!cancelled) {
          if (staffRes.success) setStaffRole(staffRes.staff.role);
          const count = tradesRes.filter((t) => 
            ["PENDING_PAYMENT", "PAID", "DISPUTED"].includes(t.status)
          ).length;
          setActiveCount(count);
        }
      } catch {}
    };

    checkData();
    loadNotifications();

    if (typeof window !== "undefined") {
      setLastSeen(localStorage.getItem(SEEN_KEY) ?? "");
    }

    const interval = setInterval(() => {
      checkData();
      loadNotifications();
    }, 20000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadNotifications]);

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/auth");
  };

  const handleMarkAllRead = () => {
    if (notifications.length > 0) {
      const newest = notifications[0].createdAt;
      localStorage.setItem(SEEN_KEY, newest);
      setLastSeen(newest);
    }
  };

  const handleNotificationClick = (item: NotificationItem) => {
    setShowNotifications(false);
    if (notifications.length > 0) {
      localStorage.setItem(SEEN_KEY, notifications[0].createdAt);
      setLastSeen(notifications[0].createdAt);
    }
    if (item.href) {
      router.push(item.href);
    }
  };

  if (!pathname?.startsWith("/dashboard")) return null;

  const isAdmin = staffRole === "ADMIN";
  const isStaff = staffRole === "ADMIN" || staffRole === "SUPPORT";

  const unreadNotifsCount = notifications.filter(
    (n) => !lastSeen || n.createdAt > lastSeen
  ).length;

  const dockItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", exact: true },
    { id: "p2p", label: "Mercado P2P", icon: ArrowLeftRight, href: "/dashboard/p2p", exact: true },
    { id: "wallets", label: "Billeteras", icon: Wallet, href: "/dashboard/wallets" },
    { id: "orders", label: "Órdenes", icon: Clock, href: "/dashboard/p2p/orders" },
    { id: "notifications", label: "Notificaciones", icon: Bell, href: "/dashboard/notifications" },
    { id: "security", label: "Seguridad", icon: Shield, href: "/dashboard/security" },
    { id: "settings", label: "Ajustes", icon: Settings, href: "/dashboard/settings" },
  ];

  return (
    <>
      {/* ============================================================== */}
      {/* 🔔 VENTANITA EMERGENTE DE NOTIFICACIONES ESTILO APPLE         */}
      {/* ============================================================== */}
      <AnimatePresence>
        {showNotifications && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotifications(false)}
              className="fixed inset-0 z-40 bg-zinc-950/30 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, y: 35, scale: 0.93 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.93 }}
              transition={{ type: "spring", damping: 26, stiffness: 360 }}
              className="fixed bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 z-50 w-[94vw] max-w-sm sm:max-w-md bg-white/95 dark:bg-zinc-900/95 backdrop-blur-3xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-[2.2rem] p-4 sm:p-5 shadow-2xl shadow-emerald-950/25 flex flex-col"
            >
              {/* Header de la ventanita */}
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-zinc-100 dark:border-zinc-800/80">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-zinc-900 dark:text-zinc-50 leading-tight">
                      Notificaciones
                    </h3>
                    <span className="text-[10px] font-bold text-zinc-400">
                      {unreadNotifsCount > 0 ? `${unreadNotifsCount} nuevas` : "Al día"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {unreadNotifsCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      title="Marcar todas como leídas"
                      className="p-1.5 rounded-xl text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-xs font-medium flex items-center gap-1"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span className="text-[10px] hidden xs:inline">Leídas</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowNotifications(false)}
                    className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Lista de Notificaciones con scroll */}
              <div className="max-h-[360px] overflow-y-auto no-scrollbar space-y-1.5 py-1">
                {loadingNotifs && notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    <span className="text-xs">Cargando avisos...</span>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-400">
                    <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-2 text-zinc-300 dark:text-zinc-600">
                      <Inbox className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">Sin notificaciones</span>
                    <span className="text-[11px] text-zinc-400 mt-0.5">Tus órdenes y movimientos aparecerán aquí.</span>
                  </div>
                ) : (
                  notifications.slice(0, 15).map((n) => {
                    const { Icon, cls } = notifIcon(n.kind);
                    const isUnread = !lastSeen || n.createdAt > lastSeen;

                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left p-3 rounded-2xl border transition-all flex items-start gap-3 group ${
                          isUnread
                            ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            : "bg-transparent hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50 border-transparent"
                        }`}
                      >
                        {/* Icono con badge */}
                        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${cls}`}>
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* Texto */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-xs text-zinc-900 dark:text-zinc-50 truncate">
                              {n.title}
                            </h4>
                            <span className="text-[10px] text-zinc-400 shrink-0 font-medium">
                              {timeAgo(n.createdAt)}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                            {n.body}
                          </p>
                        </div>

                        {/* Indicador luminoso de no leído */}
                        {isUnread && (
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-1.5 shadow-sm shadow-emerald-500/50 animate-pulse" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer con enlace al historial completo */}
              <div className="pt-3 mt-1 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                <Link
                  href="/dashboard/notifications"
                  onClick={() => setShowNotifications(false)}
                  className="w-full text-center py-2 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors flex items-center justify-center gap-1"
                >
                  <span>Ver todo el historial</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ============================================================== */}
      {/* ⚙️ POPOVER DE CONTROL CENTER (MÁS OPCIONES)                   */}
      {/* ============================================================== */}
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMore(false)}
              className="fixed inset-0 z-40 bg-zinc-950/30 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, y: 35, scale: 0.93 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.93 }}
              transition={{ type: "spring", damping: 26, stiffness: 360 }}
              className="fixed bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-[2.2rem] p-5 shadow-2xl shadow-emerald-950/20"
            >
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                    Control Center · Roraima
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMore(false)}
                  className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Botones de Staff si aplica */}
              {(isAdmin || isStaff) && (
                <div className="space-y-2 mb-4">
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setShowMore(false)}
                      className="flex items-center justify-between p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-sm transition-transform hover:scale-[1.02]"
                    >
                      <div className="flex items-center gap-2.5">
                        <Gavel className="w-4 h-4" />
                        <span>Admin Center</span>
                      </div>
                      <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-indigo-500/20">
                        Admin
                      </span>
                    </Link>
                  )}
                  {isStaff && (
                    <Link
                      href="/support-panel"
                      onClick={() => setShowMore(false)}
                      className="flex items-center justify-between p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold text-sm transition-transform hover:scale-[1.02]"
                    >
                      <div className="flex items-center gap-2.5">
                        <LifeBuoy className="w-4 h-4" />
                        <span>Panel de Soporte</span>
                      </div>
                      <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-rose-500/20">
                        Staff
                      </span>
                    </Link>
                  )}
                </div>
              )}

              {/* Programa de Referidos */}
              <button
                type="button"
                onClick={() => {
                  setShowMore(false);
                  setShowReferralModal(true);
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 font-bold text-sm transition-transform hover:scale-[1.02] mb-3"
              >
                <div className="flex items-center gap-2.5">
                  <Gift className="w-4 h-4 text-amber-500" />
                  <span>Invitar Amigos (Gana 15%)</span>
                </div>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  Recompensas
                </span>
              </button>

              {/* Controles de Avisos y Tema */}
              <div className="bg-zinc-50 dark:bg-zinc-950/60 rounded-2xl p-3 border border-zinc-100 dark:border-zinc-800 space-y-3 mb-4">
                <NotificationToggle />
                <div className="flex items-center justify-between px-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
                  <span className="text-xs font-medium text-zinc-500">Modo de Pantalla</span>
                  <ThemeToggle />
                </div>
              </div>

              {/* Cerrar Sesión */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ============================================================== */}
      {/* 🚀 DOCK FLOTANTE ABAJO ESTILO IPHONE / MACOS                  */}
      {/* ============================================================== */}
      <nav 
        aria-label="Navegación principal"
        className="fixed bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 mb-[env(safe-area-inset-bottom)] max-w-[calc(100vw-1rem)]"
      >
        <motion.div 
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="bg-white/85 dark:bg-zinc-950/85 backdrop-blur-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-full px-3 xs:px-3.5 sm:px-4 py-1.5 sm:py-2 flex items-center gap-1 xs:gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar"
        >
          {dockItems.map((item) => {
            const isNotifications = item.id === "notifications";
            const isActive = isNotifications
              ? showNotifications || pathname === item.href
              : item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href);

            const isOrders = item.id === "orders";
            const badgeValue = isOrders ? activeCount : isNotifications ? unreadNotifsCount : 0;

            const buttonContent = (
              <motion.div
                whileHover={{ y: -4, scale: 1.12 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 450, damping: 25 }}
                className={`relative w-9 h-9 xs:w-10 xs:h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 aspect-square shrink-0 rounded-2xl flex flex-col items-center justify-center transition-all ${
                  isActive
                    ? "bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30 shadow-sm"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-900/80"
                }`}
              >
                <item.icon className="w-4 h-4 xs:w-4.5 xs:h-4.5 sm:w-5 sm:h-5 shrink-0" strokeWidth={isActive ? 2.5 : 2} />

                {/* Badge numérico de órdenes activas o notificaciones no leídas */}
                {badgeValue > 0 && (
                  <span className={`absolute -top-1 -right-1 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md animate-pulse ${
                    isNotifications ? "bg-rose-500 text-white" : "bg-amber-400 text-amber-950"
                  }`}>
                    {badgeValue > 9 ? "9+" : badgeValue}
                  </span>
                )}

                {/* Punto indicador activo debajo del icono */}
                {isActive && (
                  <motion.div
                    layoutId="dock-dot"
                    className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"
                  />
                )}
              </motion.div>
            );

            return (
              <div 
                key={item.id} 
                className="relative shrink-0"
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                {/* Tooltip en hover en pantallas grandes */}
                <AnimatePresence>
                  {hoveredItem === item.id && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.9 }}
                      className="hidden sm:block absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-xl bg-zinc-900/90 dark:bg-zinc-100/90 text-white dark:text-zinc-900 text-[11px] font-bold shadow-lg pointer-events-none whitespace-nowrap backdrop-blur-sm z-50"
                    >
                      {item.label}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-zinc-900/90 dark:border-t-zinc-100/90" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Si es notificaciones, despliega la ventanita emergente en lugar de redirigir */}
                {isNotifications ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMore(false);
                      setShowNotifications((prev) => !prev);
                    }}
                    aria-label="Abrir notificaciones"
                    className="block shrink-0"
                  >
                    {buttonContent}
                  </button>
                ) : (
                  <Link href={item.href} className="block shrink-0">
                    {buttonContent}
                  </Link>
                )}
              </div>
            );
          })}

          {/* Divisor vertical */}
          <div className="h-6 sm:h-7 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5 sm:mx-1 shrink-0" />

          {/* Botón Control Center / Más */}
          <div 
            className="relative shrink-0"
            onMouseEnter={() => setHoveredItem("more")}
            onMouseLeave={() => setHoveredItem(null)}
          >
            <AnimatePresence>
              {hoveredItem === "more" && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.9 }}
                  className="hidden sm:block absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-xl bg-zinc-900/90 dark:bg-zinc-100/90 text-white dark:text-zinc-900 text-[11px] font-bold shadow-lg pointer-events-none whitespace-nowrap backdrop-blur-sm z-50"
                >
                  Más opciones
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-zinc-900/90 dark:border-t-zinc-100/90" />
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="button"
              onClick={() => {
                setShowNotifications(false);
                setShowMore(!showMore);
              }}
              whileHover={{ y: -4, scale: 1.12 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 450, damping: 25 }}
              aria-label="Más opciones"
              className={`relative w-9 h-9 xs:w-10 xs:h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 aspect-square shrink-0 rounded-2xl flex items-center justify-center transition-all ${
                showMore
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30 shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-900/80"
              }`}
            >
              <MoreHorizontal className="w-4 h-4 xs:w-4.5 xs:h-4.5 sm:w-5 sm:h-5 shrink-0" />
              {(isAdmin || isStaff) && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 shadow-sm" />
              )}
            </motion.button>
          </div>

        </motion.div>
      </nav>

      <ReferralProgramModal
        isOpen={showReferralModal}
        onClose={() => setShowReferralModal(false)}
      />
    </>
  );
}
