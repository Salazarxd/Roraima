"use client";

import * as React from "react";
import { motion, Variants, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  Mail,
  BadgeCheck,
  CreditCard,
  History,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  LogOut,
  X,
  Smartphone,
  Copy,
  UserX,
  Laptop,
  Trash2
} from "lucide-react";

import { generate2FA, verifyAndEnable2FA, disable2FA } from "@/app/actions/security";
import type { DeviceInfo } from "@/app/actions/devices";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

type SecurityState = {
  email: string;
  emailVerified: boolean;
  providers: string[];
  lastSignIn: string | null;
  createdAt: string | null;
  kycStatus: string;
  paymentMethods: number;
  twoFactorEnabled: boolean;
  whitelistEnabled: boolean;
};

const PROVIDER_LABELS: Record<string, string> = {
  password: "Correo y contraseña",
  "google.com": "Google",
  "apple.com": "Apple",
  phone: "Teléfono",
};

const KYC_LABELS: Record<string, { text: string; ok: boolean }> = {
  VERIFIED: { text: "Verificada", ok: true },
  PENDING: { text: "En revisión", ok: false },
  REJECTED: { text: "Rechazada - vuelve a enviar", ok: false },
  UNVERIFIED: { text: "Sin verificar", ok: false },
};

function formatDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" });
}

export default function SecurityPage() {
  const router = useRouter();
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [state, setState] = React.useState<SecurityState | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  
  const [modal2FA, setModal2FA] = React.useState<"SETUP" | "DISABLE" | null>(null);
  const [qrCode, setQrCode] = React.useState<string | null>(null);
  const [secret2FA, setSecret2FA] = React.useState<string | null>(null);
  const [code2FA, setCode2FA] = React.useState("");
  const [devices, setDevices] = React.useState<DeviceInfo[]>([]);

  const load = React.useCallback(async () => {
    try {
      const { waitForUser, getIdToken } = await import("@/lib/client-auth");
      const user = await waitForUser();
      if (!user) { router.push("/auth"); return; }
      await user.reload().catch(() => {});
      const token = await getIdToken();
      const [{ getMyProfile }, { listUserDevices, recordDeviceHeartbeat }, { detectClientDevice }] = await Promise.all([
        import("@/app/actions/account"),
        import("@/app/actions/devices"),
        import("@/lib/device-detection"),
      ]);
      // Actualizar dispositivo actual y presencia
      await recordDeviceHeartbeat(token, detectClientDevice()).catch(() => {});

      const [res, devRes] = await Promise.all([
        getMyProfile(token),
        listUserDevices(token),
      ]);
      if (devRes.success) setDevices(devRes.devices);
      setState({
        email: user.email ?? "",
        emailVerified: user.emailVerified,
        providers: user.providerData.map((p) => p.providerId),
        lastSignIn: user.metadata.lastSignInTime ?? null,
        createdAt: user.metadata.creationTime ?? null,
        kycStatus: res.success ? res.profile.kycStatus : "UNVERIFIED",
        paymentMethods: res.success ? res.profile.paymentMethods : 0,
        twoFactorEnabled: res.success ? !!res.profile.twoFactorEnabled : false,
        whitelistEnabled: res.success ? !!(res.profile as any).whitelistEnabled : false,
      });
      if (!res.success) setErrorMessage(res.error);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "No se pudo cargar tu seguridad");
    }
  }, [router]);

  React.useEffect(() => { load(); }, [load]);

  const handlePasswordChange = async () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const { auth } = await import("@/lib/firebase");
      const { sendPasswordResetEmail } = await import("firebase/auth");
      
      const user = auth.currentUser;
      if (user && user.email) {
        await sendPasswordResetEmail(auth, user.email);
        setSuccessMessage("¡Enlace enviado! Revisa tu bandeja de entrada para cambiar tu contraseña.");
      } else {
        setErrorMessage("No se pudo identificar tu correo. Inicia sesión nuevamente.");
      }
    } catch (error: any) {
      console.error(error);
      setErrorMessage("Error enviando el correo: " + error.message);
    }
  };

  const handleVerifyEmail = async () => {
    if (!state || state.emailVerified) return;
    setBusy("email");
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const { auth } = await import("@/lib/firebase");
      const { sendEmailVerification } = await import("firebase/auth");
      if (!auth.currentUser) throw new Error("Inicia sesión nuevamente.");
      await sendEmailVerification(auth.currentUser);
      setSuccessMessage("Te enviamos un correo de verificación. Ábrelo y vuelve a esta página.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      setErrorMessage(msg.includes("too-many-requests") ? "Demasiados intentos. Espera unos minutos." : "No se pudo enviar el correo de verificación.");
    } finally {
      setBusy(null);
    }
  };

  const handleSignOut = async () => {
    setBusy("logout");
    try {
      const { auth } = await import("@/lib/firebase");
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
      router.push("/auth");
    } catch {
      setErrorMessage("No se pudo cerrar la sesión.");
      setBusy(null);
    }
  };

  const handleOpen2FA = async () => {
    if (state?.twoFactorEnabled) {
      setCode2FA("");
      setModal2FA("DISABLE");
    } else {
      setBusy("2fa");
      const { getIdToken } = await import("@/lib/client-auth");
      const res = await generate2FA(await getIdToken());
      setBusy(null);
      if (res.success) {
        setQrCode(res.qrDataUrl);
        setSecret2FA(res.secret);
        setCode2FA("");
        setModal2FA("SETUP");
      } else {
        setErrorMessage(res.error);
      }
    }
  };

  const submit2FA = async () => {
    if (!code2FA || code2FA.length !== 6) return;
    setBusy("submit2FA");
    const { getIdToken } = await import("@/lib/client-auth");
    const token = await getIdToken();
    const res = modal2FA === "SETUP" 
      ? await verifyAndEnable2FA(token, code2FA)
      : await disable2FA(token, code2FA);
    
    setBusy(null);
    if (res.success) {
      setSuccessMessage(modal2FA === "SETUP" ? "2FA habilitado correctamente" : "2FA deshabilitado");
      setModal2FA(null);
      load();
    } else {
      setErrorMessage(res.error);
    }
  };

  // Nivel de seguridad calculado con controles REALES de la cuenta
  const checks = state
    ? [state.emailVerified, state.twoFactorEnabled, state.kycStatus === "VERIFIED"]
    : [];
  const score = checks.filter(Boolean).length;
  const level = score === 3 ? "Alto" : score === 2 ? "Medio" : "Bajo";
  const levelColor = score === 3 ? "bg-emerald-600 shadow-emerald-600/20" : score === 2 ? "bg-amber-500 shadow-amber-500/20" : "bg-rose-600 shadow-rose-600/20";
  const kyc = state ? KYC_LABELS[state.kycStatus] ?? KYC_LABELS.UNVERIFIED : null;

  return (
    <div className="relative">
      <motion.div 
        variants={containerVariants} 
        initial="hidden" 
        animate="show"
        className="space-y-8 max-w-2xl mx-auto"
      >
      <motion.div variants={itemVariants} className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Seguridad</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Protege tu cuenta y tus fondos</p>
        </div>
      </motion.div>

      {/* Security Status Card */}
      {!state ? (
        <motion.div variants={itemVariants} className="bg-zinc-100 dark:bg-zinc-900 rounded-[2rem] p-6 h-32 animate-pulse" />
      ) : (
        <motion.div variants={itemVariants} className={`${levelColor} rounded-[2rem] p-6 shadow-lg text-white flex flex-col md:flex-row items-center gap-6`}>
          <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
            {score === 3 ? <ShieldCheck className="w-10 h-10 text-white" /> : <ShieldAlert className="w-10 h-10 text-white" />}
          </div>
          <div className="text-center md:text-left flex-1">
            <h2 className="text-xl font-bold">Nivel de Seguridad: {level}</h2>
            <p className="text-white/80 text-sm mt-1">
              {score === 3
                ? "Has completado todas las medidas recomendadas para proteger tu cuenta."
                : `Completaste ${score} de 3 medidas recomendadas. Completa las pendientes para operar sin restricciones.`}
            </p>
          </div>
        </motion.div>
      )}

      {/* Authentication Options */}
      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-4 sm:p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60">
        <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50 mb-4 px-2">Autenticación</h3>
        <div className="space-y-2">
          
          <div
            id="security-email-verify"
            onClick={handleVerifyEmail}
            className={`flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 rounded-2xl transition-colors group ${state && !state.emailVerified ? "cursor-pointer" : ""}`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${state?.emailVerified ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"}`}>
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-50">Correo electrónico</div>
                <div className="text-xs text-zinc-500">
                  {state ? state.email : "—"}
                  {state && !state.emailVerified && (busy === "email" ? " · Enviando..." : " · Toca para enviar verificación")}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {state && (state.emailVerified
                ? <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-lg">VERIFICADO</span>
                : <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-lg">PENDIENTE</span>)}
              <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-colors" />
            </div>
          </div>

          <div
            id="security-kyc"
            onClick={() => router.push("/dashboard/profile")}
            className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 rounded-2xl cursor-pointer transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kyc?.ok ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"}`}>
                <BadgeCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-50">Verificación de identidad (KYC)</div>
                <div className="text-xs text-zinc-500">Requerida para operar en P2P y retirar</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {kyc && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${kyc.ok ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20" : "text-zinc-500 bg-zinc-100 dark:bg-zinc-800"}`}>{kyc.text.toUpperCase()}</span>
              )}
              <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-colors" />
            </div>
          </div>

          <div
            id="security-payment-methods"
            onClick={() => router.push("/dashboard/p2p/payment-methods")}
            className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 rounded-2xl cursor-pointer transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-300">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-50">Métodos de pago</div>
                <div className="text-xs text-zinc-500">Necesarios para vender USDT en P2P</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {state && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${state.paymentMethods > 0 ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20" : "text-zinc-500 bg-zinc-100 dark:bg-zinc-800"}`}>{state.paymentMethods}</span>
              )}
              <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-colors" />
            </div>
          </div>

          <div
            id="security-whitelist"
            onClick={() => router.push("/dashboard/security/whitelist")}
            className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 rounded-2xl cursor-pointer transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${state?.whitelistEnabled ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"}`}>
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-50">Lista Blanca (Whitelist)</div>
                <div className="text-xs text-zinc-500">Limita los retiros solo a direcciones seguras</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {state && (state.whitelistEnabled
                ? <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-lg">ACTIVO</span>
                : <span className="text-xs font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg">INACTIVO</span>)}
              <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-colors" />
            </div>
          </div>

          <div
            id="security-blacklist"
            onClick={() => router.push("/dashboard/security/blacklist")}
            className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 rounded-2xl cursor-pointer transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                <UserX className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-50">Usuarios Bloqueados</div>
                <div className="text-xs text-zinc-500">Comerciantes que has bloqueado en P2P</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-colors" />
            </div>
          </div>

          <div
            id="security-2fa"
            onClick={handleOpen2FA}
            className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 rounded-2xl cursor-pointer transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${state?.twoFactorEnabled ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"}`}>
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  Doble Factor (2FA) {busy === "2fa" && <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />}
                </div>
                <div className="text-xs text-zinc-500">Usa Google Authenticator para P2P y Retiros</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {state && (state.twoFactorEnabled
                ? <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-lg">ACTIVO</span>
                : <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-lg">INACTIVO</span>)}
              <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-colors" />
            </div>
          </div>

          {(!state || state.providers.includes("password")) && (
          <div 
            id="security-change-password"
            onClick={handlePasswordChange}
            className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 rounded-2xl cursor-pointer transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-300">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-50">Cambiar Contraseña</div>
                <div className="text-xs text-zinc-500">Se te enviará un correo de recuperación</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-colors" />
          </div>
          )}

        </div>
      </motion.div>

      {/* Session activity */}
      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-4 sm:p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60">
        <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50 mb-4 px-2 flex items-center gap-2">
          <History className="w-5 h-5 text-zinc-400" />
          Actividad de la cuenta
        </h3>
        <div className="space-y-4 px-2">
          
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm">Último inicio de sesión</span>
              <span className="text-xs text-zinc-500">{state ? formatDate(state.lastSignIn) : "—"}</span>
            </div>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-lg">Sesión Actual</span>
          </div>

          <div className="w-full h-px bg-zinc-100 dark:bg-zinc-800" />

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm">Método de acceso</span>
              <span className="text-xs text-zinc-500">
                {state ? (state.providers.map((p) => PROVIDER_LABELS[p] ?? p).join(", ") || "—") : "—"}
              </span>
            </div>
          </div>

          <div className="w-full h-px bg-zinc-100 dark:bg-zinc-800" />

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm">Cuenta creada</span>
              <span className="text-xs text-zinc-500">{state ? formatDate(state.createdAt) : "—"}</span>
            </div>
            <button
              id="security-sign-out"
              onClick={handleSignOut}
              disabled={busy === "logout"}
              className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              {busy === "logout" ? "Cerrando..." : "Cerrar sesión"}
            </button>
          </div>

        </div>
      </motion.div>

      {/* Dispositivos de Confianza y Sesiones Reconocidas */}
      <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] p-4 sm:p-6 shadow-sm border border-zinc-100 dark:border-zinc-800/60">
        <div className="flex items-center justify-between mb-4 px-2">
          <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-500" />
            Dispositivos de Confianza
          </h3>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {devices.length} {devices.length === 1 ? "Reconocido" : "Reconocidos"}
          </span>
        </div>

        <p className="text-xs text-zinc-500 mb-4 px-2">
          Equipos y navegadores que tienen permiso para acceder a tu cuenta en Roraima Exchange. Si no reconoces un dispositivo, revócalo de inmediato.
        </p>

        <div className="space-y-3">
          {devices.length === 0 ? (
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 text-center text-xs text-zinc-400">
              No hay dispositivos registrados aún.
            </div>
          ) : (
            devices.map((d, index) => {
              const isPhone = d.os.toLowerCase().includes("android") || d.os.toLowerCase().includes("ios") || d.os.toLowerCase().includes("iphone");
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-100 dark:border-zinc-800 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0 text-zinc-600 dark:text-zinc-300 shadow-sm">
                      {isPhone ? <Smartphone className="w-5 h-5" /> : <Laptop className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-zinc-900 dark:text-zinc-50 truncate">
                          {d.deviceName}
                        </span>
                        {index === 0 && (
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                            Activo ahora
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {d.browser} · {d.os} {d.ip ? `· IP: ${d.ip}` : ""}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`¿Deseas revocar el acceso a "${d.deviceName}"?`)) return;
                      const { getIdToken } = await import("@/lib/client-auth");
                      const { revokeDevice } = await import("@/app/actions/devices");
                      const res = await revokeDevice(await getIdToken(), d.id);
                      if (res.success) {
                        setDevices((prev) => prev.filter((item) => item.id !== d.id));
                        setSuccessMessage("Dispositivo revocado correctamente");
                      }
                    }}
                    className="p-2 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-500/10 transition-colors shrink-0"
                    title="Revocar este dispositivo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </motion.div>

      </motion.div>

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

      <AnimatePresence>
        {modal2FA && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => busy !== "submit2FA" && setModal2FA(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-2xl border border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-center w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl mx-auto mb-4">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-center text-zinc-900 dark:text-zinc-50 mb-2">
                {modal2FA === "SETUP" ? "Habilitar 2FA" : "Deshabilitar 2FA"}
              </h3>
              
              {modal2FA === "SETUP" ? (
                <>
                  <p className="text-sm text-center text-zinc-500 mb-4">Escanea este código QR con Google Authenticator o Authy.</p>
                  {qrCode && <img src={qrCode} alt="QR Code" className="w-48 h-48 mx-auto mb-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800" />}
                  {secret2FA && (
                    <div className="mb-4 text-center">
                      <span className="text-xs text-zinc-500">O ingresa esta clave manualmente:</span>
                      <div className="mt-1 flex items-center justify-center gap-2">
                        <code className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-50 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-lg">{secret2FA}</code>
                        <button onClick={() => navigator.clipboard.writeText(secret2FA)} className="p-1.5 text-zinc-400 hover:text-emerald-500 transition-colors">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-sm font-semibold text-center text-zinc-700 dark:text-zinc-300 mb-2">Ingresa el código de 6 dígitos</p>
                </>
              ) : (
                <p className="text-sm text-center text-zinc-500 mb-6">Ingresa el código actual de tu aplicación de autenticación para desactivar el 2FA.</p>
              )}

              <input
                type="text"
                value={code2FA}
                onChange={(e) => setCode2FA(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-center text-2xl tracking-[0.5em] font-mono outline-none focus:border-amber-500 mb-6"
              />

              <div className="flex gap-3">
                <button onClick={() => setModal2FA(null)} disabled={busy === "submit2FA"} className="flex-1 py-3 rounded-2xl font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Cancelar</button>
                <button onClick={submit2FA} disabled={busy === "submit2FA" || code2FA.length !== 6} className="flex-1 py-3 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {busy === "submit2FA" ? "Verificando..." : "Confirmar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
