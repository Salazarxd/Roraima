"use client";

import * as React from "react";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { 
  User, 
  Settings as SettingsIcon, 
  Bell, 
  Shield, 
  LogOut,
  ChevronRight
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRouter } from "next/navigation";

const KYC_BADGE: Record<string, { text: string; cls: string }> = {
  VERIFIED: { text: "KYC Verificado", cls: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" },
  PENDING: { text: "KYC en revisión", cls: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" },
  REJECTED: { text: "KYC rechazado", cls: "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" },
  UNVERIFIED: { text: "Sin verificar", cls: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500" },
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = React.useState<{ name: string; email: string; kycStatus: string } | null>(null);
  const [loggingOut, setLoggingOut] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const { getIdToken, waitForUser } = await import("@/lib/client-auth");
        const fbUser = await waitForUser();
        if (!fbUser) { router.push("/auth"); return; }
        const { getMyProfile } = await import("@/app/actions/account");
        const res = await getMyProfile(await getIdToken());
        const p = res.success ? res.profile : null;
        setMe({
          name: p?.name || [p?.firstName, p?.lastName].filter(Boolean).join(" ") || fbUser.displayName || "Usuario",
          email: p?.email ?? fbUser.email ?? "",
          kycStatus: p?.kycStatus ?? "UNVERIFIED",
        });
      } catch {
        setMe({ name: "Usuario", email: "", kycStatus: "UNVERIFIED" });
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const { auth } = await import("@/lib/firebase");
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
      router.push("/auth");
    } catch {
      setLoggingOut(false);
    }
  };

  const badge = KYC_BADGE[me?.kycStatus ?? "UNVERIFIED"] ?? KYC_BADGE.UNVERIFIED;

  return (
    <motion.div 
      variants={containerVariants} 
      initial="hidden" 
      animate="show"
      className="space-y-8 max-w-2xl mx-auto"
    >
      <motion.div variants={itemVariants} className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Mi Perfil</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Ajustes y preferencias de la cuenta</p>
        </div>
      </motion.div>

      {/* User Profile Card */}
      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60 flex flex-col md:flex-row items-center gap-6">
        <div className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <span className="text-4xl text-white font-bold">{me ? (me.name.charAt(0) || "U").toUpperCase() : ""}</span>
        </div>
        <div className="text-center md:text-left flex-1">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{me ? me.name : <span className="inline-block w-40 h-6 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />}</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-2">{me?.email ?? ""}</p>
          {me && (
            <span className={`inline-block px-3 py-1 font-bold text-xs rounded-full ${badge.cls}`}>
              {badge.text}
            </span>
          )}
        </div>
        <Link id="settings-edit-profile" href="/dashboard/profile" className="px-6 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 font-semibold rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
          Editar Perfil
        </Link>
      </motion.div>

      {/* Settings Options */}
      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-4 sm:p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60">
        <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50 mb-4 px-2">Preferencias Generales</h3>
        <div className="space-y-2">
          
          <div className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 rounded-2xl cursor-pointer transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-300">
                <SettingsIcon className="w-5 h-5" />
              </div>
              <div className="font-semibold text-zinc-900 dark:text-zinc-50">Modo de visualización</div>
            </div>
            <ThemeToggle />
          </div>

          {[
            { icon: Shield, label: "Seguridad y Contraseña", desc: "Verificación de correo, contraseña, KYC", href: "/dashboard/security" },
            { icon: Bell, label: "Notificaciones", desc: "Órdenes P2P, depósitos y retiros", href: "/dashboard/notifications" },
            { icon: User, label: "Información Personal", desc: "Dirección, Teléfono", href: "/dashboard/profile" },
          ].map((setting, idx) => (
            <Link href={setting.href} key={idx} className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 rounded-2xl cursor-pointer transition-colors group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-300 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  <setting.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-zinc-50">{setting.label}</div>
                  <div className="text-xs text-zinc-500">{setting.desc}</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-colors" />
            </Link>
          ))}

        </div>
      </motion.div>

      {/* Logout */}
      <motion.div variants={itemVariants}>
        <button id="settings-logout" onClick={handleLogout} disabled={loggingOut} className="w-full flex items-center justify-center gap-3 p-4 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold rounded-[2rem] transition-colors border border-rose-100 dark:border-rose-900/30 disabled:opacity-60">
          <LogOut className="w-5 h-5" />
          {loggingOut ? "Cerrando sesión..." : "Cerrar Sesión"}
        </button>
      </motion.div>

    </motion.div>
  );
}
