"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  Wallet, 
  Settings, 
  Shield, 
  LogOut,
  Menu,
  Gavel,
  Bell,
  LifeBuoy
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { NotificationToggle } from "./notification-toggle";
import { auth } from "@/lib/firebase";
import { waitForUser } from "@/lib/client-auth";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: ArrowLeftRight, label: "Mercado P2P", href: "/dashboard/p2p" },
  { icon: Wallet, label: "Billeteras", href: "/dashboard/wallets" },
  { icon: Bell, label: "Notificaciones", href: "/dashboard/notifications" },
  { icon: Shield, label: "Seguridad", href: "/dashboard/security" },
  { icon: Settings, label: "Ajustes", href: "/dashboard/settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [staffRole, setStaffRole] = React.useState<"ADMIN" | "SUPPORT" | null>(null);

  // Accesos de staff: el SERVIDOR confirma el rol (nunca se decide en el cliente)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await waitForUser();
      if (!user) return;
      const { getStaffSession } = await import("@/app/actions/admin");
      const res = await getStaffSession(await user.getIdToken());
      if (!cancelled) setStaffRole(res.success ? res.staff.role : null);
    })();
    return () => { cancelled = true; };
  }, []);
  const isAdmin = staffRole === "ADMIN";
  const isStaff = staffRole === "ADMIN" || staffRole === "SUPPORT";

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/auth");
  };

  return (
    <motion.aside 
      initial={false}
      animate={{ width: isCollapsed ? "80px" : "260px" }}
      className="hidden md:flex flex-col bg-white dark:bg-zinc-950 border-r border-zinc-100 dark:border-zinc-900 h-screen sticky top-0 z-40 transition-all duration-300"
    >
      <div className="flex items-center justify-between px-6 pt-8 pb-4 h-auto min-h-[5rem]">
        <div className="flex items-center justify-center w-full transition-all">
          <Link href="/dashboard" className="flex items-center justify-center w-full">
            {!isCollapsed ? (
              <motion.img 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                src="/logo-transparent.png" 
                alt="Roraima Exchange" 
                className="w-36 h-auto object-contain drop-shadow-md" 
              />
            ) : (
              <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 shadow-lg shadow-emerald-500/20 bg-zinc-950/5">
                <img 
                  src="/logo-transparent.png" 
                  alt="Roraima Exchange" 
                  className="w-full h-full object-cover object-top scale-125" 
                />
              </div>
            )}
          </Link>
        </div>
      </div>

      <div className="flex-1 py-6 flex flex-col gap-2 px-3 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all ${
                isActive 
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-semibold" 
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
              {isActive && !isCollapsed && (
                <motion.div 
                  layoutId="sidebar-active" 
                  className="absolute left-0 w-1 h-8 bg-emerald-500 rounded-r-full" 
                />
              )}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            id="sidebar-admin-center"
            href="/admin"
            className="flex items-center gap-4 px-3 py-3 rounded-2xl transition-all text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 font-semibold mt-2 border border-indigo-500/20"
          >
            <Gavel className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Admin Center</span>}
          </Link>
        )}
        {isStaff && (
          <Link
            id="sidebar-support-panel"
            href="/support-panel"
            className={`flex items-center gap-4 px-3 py-3 rounded-2xl transition-all text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 font-semibold border border-rose-500/20 ${isAdmin ? "" : "mt-2"}`}
          >
            <LifeBuoy className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Panel de Soporte</span>}
          </Link>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4">
        <NotificationToggle collapsed={isCollapsed} />
        {!isCollapsed ? (
          <div className="flex items-center justify-between px-3">
            <span className="text-xs font-medium text-zinc-500">Tema</span>
            <ThemeToggle />
          </div>
        ) : (
          <div className="flex justify-center">
            <ThemeToggle />
          </div>
        )}
        
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex items-center gap-4 px-3 py-3 rounded-2xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors mt-2"
        >
          <Menu className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span>Colapsar Menu</span>}
        </button>

        <button onClick={handleLogout} className="flex items-center gap-4 px-3 py-3 rounded-2xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </motion.aside>
  );
}
