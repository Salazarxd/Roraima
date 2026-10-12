"use client";

import * as React from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Mail, Lock, User, CreditCard, ShieldCheck, Gift } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { useRouter } from "next/navigation";

export function AuthForm() {
  const [activeTab, setActiveTab] = React.useState<"login" | "register">("login");
  // Los botones "Registrarse" de la web pública llegan con ?modo=registro
  // ?next=/ruta → a dónde volver tras iniciar sesión (p. ej. la Compra rápida de la mascota)
  const nextRef = React.useRef("/dashboard");
  const [referralCode, setReferralCode] = React.useState("");
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("modo") === "registro") setActiveTab("register");
    const refParam = q.get("ref");
    if (refParam) {
      setReferralCode(refParam.toUpperCase());
      setActiveTab("register");
    }
    const next = q.get("next");
    // Solo rutas internas (evita redirecciones abiertas a otros dominios)
    if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) nextRef.current = next;
  }, []);
  const [show2FA, setShow2FA] = React.useState(false);
  const [twoFactorCode, setTwoFactorCode] = React.useState("");
  const [pendingIdToken, setPendingIdToken] = React.useState<string | null>(null);

  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [cedula, setCedula] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Paso 2: Si ya está en pantalla 2FA, validar el código TOTP
    if (show2FA) {
      if (!twoFactorCode || twoFactorCode.length !== 6) {
        return setError("Ingresa los 6 dígitos de tu aplicación autenticadora");
      }
      setLoading(true);
      try {
        const { validateLogin2FA } = await import("@/app/actions/security");
        const res = await validateLogin2FA(pendingIdToken!, twoFactorCode);
        if (!res.success) {
          throw new Error(res.error || "Código 2FA incorrecto o expirado");
        }
        // Registrar dispositivo de confianza
        try {
          const { recordDeviceHeartbeat } = await import("@/app/actions/devices");
          const { detectClientDevice } = await import("@/lib/device-detection");
          await recordDeviceHeartbeat(pendingIdToken!, detectClientDevice());
        } catch {}
        router.push(nextRef.current);
      } catch (err: any) {
        setError(err.message || "Código 2FA no válido");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Paso 1: Autenticar credenciales con Firebase
    if (!email || !password) return setError("Llene todos los campos");
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const token = await userCredential.user.getIdToken();

      const { checkUser2FAStatus } = await import("@/app/actions/security");
      const check = await checkUser2FAStatus(token);

      if (check.success && check.twoFactorEnabled) {
        setPendingIdToken(token);
        setShow2FA(true);
        setTwoFactorCode("");
        return;
      }

      // Si no tiene 2FA, registrar dispositivo y entrar
      try {
        const { recordDeviceHeartbeat } = await import("@/app/actions/devices");
        const { detectClientDevice } = await import("@/lib/device-detection");
        await recordDeviceHeartbeat(token, detectClientDevice());
      } catch {}
      router.push(nextRef.current);
    } catch (err: any) {
      setError("Credenciales incorrectas o usuario no encontrado");
      setShow2FA(false);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true); setError("");
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      
      const { syncUserToDatabase } = await import("@/app/actions/auth");
      const dbResult = await syncUserToDatabase({
        idToken: await userCredential.user.getIdToken(),
        name: userCredential.user.displayName || "Usuario Google",
        document: "" // Document can be asked later in KYC
      });

      if (!dbResult.success) {
        throw new Error(dbResult.error);
      }

      const token = await userCredential.user.getIdToken();
      const { checkUser2FAStatus } = await import("@/app/actions/security");
      const check = await checkUser2FAStatus(token);

      if (check.success && check.twoFactorEnabled) {
        setPendingIdToken(token);
        setShow2FA(true);
        setTwoFactorCode("");
        return;
      }

      // Registrar dispositivo de confianza
      try {
        const { recordDeviceHeartbeat } = await import("@/app/actions/devices");
        const { detectClientDevice } = await import("@/lib/device-detection");
        await recordDeviceHeartbeat(token, detectClientDevice());
      } catch {}

      router.push(nextRef.current);
    } catch (err: any) {
      console.error("Error Google Auth:", err);
      if (err?.code === "auth/unauthorized-domain") {
        setError("Dominio no autorizado: Debes agregar 'roraimacripto.vefixy.net' en Firebase Console > Authentication > Settings > Authorized domains.");
      } else if (err?.code === "auth/popup-closed-by-user") {
        setError("Inicio de sesión con Google cancelado.");
      } else {
        setError(err?.message || "Error al iniciar sesión con Google");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !name || !cedula) return setError("Llene todos los campos");
    setLoading(true); setError("");
    try {
      // 1. Crear el usuario en Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // 2. Sincronizar el nuevo usuario y crearle su billetera en MySQL a través del Server Action
      const { syncUserToDatabase } = await import("@/app/actions/auth");
      const dbResult = await syncUserToDatabase({
        idToken: await userCredential.user.getIdToken(),
        name: name,
        document: cedula,
        referralCode: referralCode || undefined
      });

      if (!dbResult.success) {
        // Cédula duplicada o inválida: eliminar la cuenta de Firebase recién creada (una cédula = una cuenta)
        await userCredential.user.delete().catch(() => auth.signOut());
        throw new Error(dbResult.error);
      }

      router.push("/kyc");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  // Tab variants for spring animations
  const tabVariants: Variants = {
    hidden: { opacity: 0, x: activeTab === "login" ? -20 : 20 },
    visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
    exit: { opacity: 0, x: activeTab === "login" ? 20 : -20, transition: { duration: 0.2 } }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Container with Glassmorphism */}
      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-2xl shadow-zinc-200/50 dark:shadow-black/50 border border-zinc-200/50 dark:border-zinc-800/50">
        
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="relative w-24 h-24 rounded-2xl overflow-hidden drop-shadow-xl">
            <img src="/logo-transparent.png" alt="Roraima Exchange" className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Tabs Header */}
        <div className="relative flex p-1 mb-8 bg-zinc-100 dark:bg-zinc-950 rounded-2xl">
          <button
            onClick={() => { setActiveTab("login"); setError(""); }}
            className={`relative flex-1 py-3 text-sm font-semibold rounded-xl transition-colors z-10 ${
              activeTab === "login" ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            onClick={() => { setActiveTab("register"); setError(""); }}
            className={`relative flex-1 py-3 text-sm font-semibold rounded-xl transition-colors z-10 ${
              activeTab === "register" ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Crear Cuenta
          </button>

          
          {/* Animated Tab Indicator */}
          <motion.div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-zinc-800 rounded-xl shadow-sm z-0"
            initial={false}
            animate={{
              left: activeTab === "login" ? "4px" : "calc(50%)",
            }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        </div>

        {/* Tab Content */}
        <div className="relative min-h-[320px]">
          <AnimatePresence mode="wait">
            {activeTab === "login" ? (
              <motion.form
                key="login"
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-5"
                onSubmit={handleLogin}
              >
                {!show2FA ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 pl-1">Correo Electrónico</label>
                      <div className="relative flex items-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-500/20">
                        <Mail className="w-5 h-5 text-zinc-400 mr-3" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="tu@correo.com"
                          className="w-full bg-transparent text-zinc-900 dark:text-zinc-50 outline-none placeholder:text-zinc-400"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 pl-1">Contraseña</label>
                      <div className="relative flex items-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-500/20">
                        <Lock className="w-5 h-5 text-zinc-400 mr-3" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-transparent text-zinc-900 dark:text-zinc-50 outline-none placeholder:text-zinc-400"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button type="button" className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>

                    {error && (
                      <p className="text-sm font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-100 dark:border-rose-900/50">
                        {error}
                      </p>
                    )}

                    <button disabled={loading} type="submit" className="w-full mt-4 disabled:opacity-50 py-4 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-400 dark:hover:bg-emerald-500 text-white dark:text-zinc-950 font-bold rounded-2xl shadow-lg shadow-emerald-600/20 dark:shadow-emerald-400/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                      {loading ? "Cargando..." : "Continuar"}
                    </button>
                    
                    <div className="relative flex items-center py-4">
                      <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
                      <span className="flex-shrink-0 mx-4 text-zinc-400 text-sm font-medium">O continuar con</span>
                      <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
                    </div>
                    
                    <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="w-full py-3.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-50 font-bold rounded-2xl transition-all flex items-center justify-center gap-3 shadow-sm">
                      <svg viewBox="0 0 24 24" className="w-5 h-5">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Google
                    </button>
                  </>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-5"
                  >
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Autenticación 2FA</h3>
                      <p className="text-sm text-zinc-500 mt-1">Ingresa el código de 6 dígitos de tu app autenticadora.</p>
                    </div>

                    <div className="relative flex items-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors focus-within:border-emerald-500 dark:focus-within:border-emerald-400">
                      <input
                        type="text"
                        maxLength={6}
                        autoFocus
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        className="w-full bg-transparent text-center text-2xl tracking-[0.5em] font-mono text-zinc-900 dark:text-zinc-50 outline-none placeholder:text-zinc-300"
                      />
                    </div>

                    <button disabled={loading || twoFactorCode.length !== 6} type="submit" className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]">
                      {loading ? "Verificando..." : "Acceder a mi Cuenta"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShow2FA(false);
                        setPendingIdToken(null);
                        setTwoFactorCode("");
                        setError("");
                      }}
                      className="w-full py-2.5 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                    >
                      ← Volver al inicio de sesión
                    </button>
                  </motion.div>
                )}
              </motion.form>
            ) : (
              <motion.form
                key="register"
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-4"
              onSubmit={handleRegister}>
                <div className="space-y-1">
                  <div className="relative flex items-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-500/20">
                    <User className="w-5 h-5 text-zinc-400 mr-3" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nombre Completo"
                      className="w-full bg-transparent text-zinc-900 dark:text-zinc-50 outline-none placeholder:text-zinc-400"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="relative flex items-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-500/20">
                    <CreditCard className="w-5 h-5 text-zinc-400 mr-3" />
                    <input
                      type="text"
                      value={cedula}
                      onChange={(e) => setCedula(e.target.value)}
                      placeholder="Cédula de Identidad (V-)"
                      className="w-full bg-transparent text-zinc-900 dark:text-zinc-50 outline-none placeholder:text-zinc-400"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="relative flex items-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-500/20">
                    <Mail className="w-5 h-5 text-zinc-400 mr-3" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Correo Electrónico"
                      className="w-full bg-transparent text-zinc-900 dark:text-zinc-50 outline-none placeholder:text-zinc-400"
                    />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="relative flex items-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-500/20">
                    <Lock className="w-5 h-5 text-zinc-400 mr-3" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Crear Contraseña"
                      className="w-full bg-transparent text-zinc-900 dark:text-zinc-50 outline-none placeholder:text-zinc-400"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="relative flex items-center bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-colors focus-within:border-amber-500 dark:focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-500/20">
                    <Gift className="w-5 h-5 text-amber-500 mr-3" />
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder="Código de Referido (Opcional)"
                      className="w-full bg-transparent text-zinc-900 dark:text-zinc-50 uppercase font-mono tracking-wider outline-none placeholder:normal-case placeholder:font-sans placeholder:tracking-normal placeholder:text-zinc-400"
                    />
                    {referralCode && (
                      <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        Aplicado
                      </span>
                    )}
                  </div>
                </div>

                {error && (
                  <p className="text-sm font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-100 dark:border-rose-900/50">
                    {error}
                  </p>
                )}
                <button type="submit" disabled={loading} className="w-full mt-6 py-4 disabled:opacity-50 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-400 dark:hover:bg-emerald-500 text-white dark:text-zinc-950 font-bold rounded-2xl shadow-lg shadow-emerald-600/20 dark:shadow-emerald-400/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                  {loading ? "Creando Cuenta y Billetera..." : "Crear Cuenta"}
                </button>
                
                <div className="relative flex items-center py-4">
                  <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
                  <span className="flex-shrink-0 mx-4 text-zinc-400 text-sm font-medium">O regístrate con</span>
                  <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
                </div>
                
                <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="w-full py-3.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-50 font-bold rounded-2xl transition-all flex items-center justify-center gap-3 shadow-sm">
                  <svg viewBox="0 0 24 24" className="w-5 h-5">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Google
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
