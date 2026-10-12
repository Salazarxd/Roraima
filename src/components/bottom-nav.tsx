"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, Wallet, ArrowLeftRight, User, Clock } from "lucide-react";

export function BottomNav() {
  const pathname = usePathname();
  const [activeCount, setActiveCount] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const checkActive = async () => {
      try {
        const { waitForUser, getIdToken } = await import("@/lib/client-auth");
        const u = await waitForUser();
        if (!u || cancelled) return;
        const { fetchMyTrades } = await import("@/app/actions/p2p");
        const trades = await fetchMyTrades(await getIdToken());
        if (!cancelled) {
          const count = trades.filter((t) => ["PENDING_PAYMENT", "PAID", "DISPUTED"].includes(t.status)).length;
          setActiveCount(count);
        }
      } catch {}
    };
    checkActive();
    const interval = setInterval(checkActive, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Solo dentro del panel: en la web pública no debe mostrarse
  const navItems = [
    { label: "Inicio", icon: Home, href: "/dashboard", exact: true },
    { label: "P2P", icon: ArrowLeftRight, href: "/dashboard/p2p", exact: true },
    { label: "Órdenes", icon: Clock, href: "/dashboard/p2p/orders", badge: activeCount },
    { label: "Billetera", icon: Wallet, href: "/dashboard/wallets" },
    { label: "Perfil", icon: User, href: "/dashboard/settings" },
  ];

  if (!pathname?.startsWith("/dashboard")) return null;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-900 pb-[env(safe-area-inset-bottom)] transition-colors">
      <div className="flex justify-around items-center h-[54px] px-1">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname?.startsWith(item.href);

          return (
            <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center justify-center h-full relative">
              <motion.div
                whileTap={{ scale: 0.85 }}
                className="flex flex-col items-center justify-center w-full h-full relative"
              >
                {isActive && (
                  <motion.div 
                    layoutId="nav-indicator" 
                    className="absolute top-0 w-8 h-0.5 bg-emerald-500 rounded-b-full" 
                  />
                )}
                <div className="relative">
                  <item.icon className={`w-5 h-5 mb-0.5 transition-colors ${isActive ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-zinc-400 dark:text-zinc-500"}`} strokeWidth={isActive ? 2.5 : 2} />
                  {item.badge != null && item.badge > 0 && (
                    <span className="absolute -top-1 -right-2 bg-amber-400 text-amber-950 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[9px] font-bold transition-colors ${isActive ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400 dark:text-zinc-500"}`}>
                  {item.label}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
