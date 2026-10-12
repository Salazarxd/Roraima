"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, UploadCloud, ShieldCheck, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, X, IdCard, BookOpen, Car } from "lucide-react";
import { useRouter } from "next/navigation";

type DocType = "CEDULA" | "PASAPORTE" | "LICENCIA";

const DOC_OPTIONS: { key: DocType; label: string; icon: React.ElementType; front: string; back: string; selfie: string }[] = [
  { key: "CEDULA", label: "Cédula de identidad", icon: IdCard, front: "Parte frontal de tu cédula", back: "Parte trasera de tu cédula", selfie: "tu cédula" },
  { key: "PASAPORTE", label: "Pasaporte", icon: BookOpen, front: "Página de datos de tu pasaporte", back: "Página de firma de tu pasaporte", selfie: "tu pasaporte abierto" },
  { key: "LICENCIA", label: "Licencia de conducir", icon: Car, front: "Parte frontal de tu licencia", back: "Parte trasera de tu licencia", selfie: "tu licencia" },
];

const digits = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

export function KycWizard() {
  const [step, setStep] = React.useState(1);
  const [frontImage, setFrontImage] = React.useState<string | null>(null);
  const [backImage, setBackImage] = React.useState<string | null>(null);
  const [selfieImage, setSelfieImage] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [docType, setDocType] = React.useState<DocType | null>(null);
  const [docNumber, setDocNumber] = React.useState("");
  const [profileDoc, setProfileDoc] = React.useState<string | null>(null);
  
  const router = useRouter();
  const files = React.useRef<{ front?: Blob; back?: Blob; selfie?: Blob }>({});
  const doc = DOC_OPTIONS.find((d) => d.key === docType) ?? DOC_OPTIONS[0];

  // Cédula registrada en el perfil: el documento subido debe tener ese mismo número
  React.useEffect(() => {
    (async () => {
      try {
        const { getIdToken } = await import("@/lib/client-auth");
        const { getMyProfile } = await import("@/app/actions/account");
        const res = await getMyProfile(await getIdToken());
        if (res.success) setProfileDoc(res.profile.document);
      } catch {
        /* el servidor vuelve a validar */
      }
    })();
  }, []);

  const numberMatches = Boolean(profileDoc) && digits(docNumber).length > 0 && digits(docNumber) === digits(profileDoc);
  const numberMismatch = digits(docNumber).length >= 6 && Boolean(profileDoc) && !numberMatches;

  /** Reduce la foto a máx. 1600px en JPEG para que la subida sea rápida y no supere el límite. */
  const compressImage = (file: File): Promise<Blob> =>
    new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85);
        URL.revokeObjectURL(url);
      };
      img.onerror = () => resolve(file);
      img.src = url;
    });

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string | null>>,
    key: "front" | "back" | "selfie"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Selecciona una imagen (JPG, PNG o WEBP).");
      return;
    }
    const blob = await compressImage(file);
    files.current[key] = blob;
    setter(URL.createObjectURL(blob));
  };

  const handleFinish = async () => {
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const { front, back, selfie } = files.current;
      if (!front || !back || !selfie) throw new Error("Faltan fotos");
      const { getIdToken } = await import("@/lib/client-auth");
      const fd = new FormData();
      fd.append("idToken", await getIdToken());
      fd.append("documentType", docType ?? "");
      fd.append("documentNumber", docNumber);
      fd.append("front", front, "front.jpg");
      fd.append("back", back, "back.jpg");
      fd.append("selfie", selfie, "selfie.jpg");

      const { submitKycDocuments } = await import("@/app/actions/kyc");
      const result = await submitKycDocuments(fd);
      
      if (result.success) {
        setStep(5); // Success step
      } else {
        setErrorMessage(result.error || "Error desconocido");
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Hubo un error enviando los documentos.");
    } finally {
      setIsUploading(false);
    }
  };

  const nextStep = () => setStep((prev) => Math.min(prev + 1, 5));
  const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* ProgressBar */}
      <div className="mb-8">
        <div className="flex justify-between text-xs font-semibold text-zinc-400 mb-2 px-2">
          <span className={step >= 1 ? "text-emerald-600 dark:text-emerald-400" : ""}>Inicio</span>
          <span className={step >= 2 ? "text-emerald-600 dark:text-emerald-400" : ""}>Frente</span>
          <span className={step >= 3 ? "text-emerald-600 dark:text-emerald-400" : ""}>Dorso</span>
          <span className={step >= 4 ? "text-emerald-600 dark:text-emerald-400" : ""}>Selfie</span>
        </div>
        <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-emerald-500"
            initial={{ width: "25%" }}
            animate={{ width: `${(step / 4) * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>
      </div>

      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-2xl shadow-zinc-200/50 dark:shadow-black/50 border border-zinc-200/50 dark:border-zinc-800/50 min-h-[450px] relative overflow-hidden">
        
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-full justify-between"
            >
              <div>
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mb-6">
                  <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">Verificación de Identidad (KYC)</h2>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
                  Para cumplir con las regulaciones vigentes en Venezuela (LOCDOFT) y proteger nuestra comunidad P2P, necesitamos verificar tu identidad. Este proceso tomará menos de 2 minutos.
                </p>

                <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-3">¿Qué documento vas a usar?</div>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {DOC_OPTIONS.map((d) => {
                    const Icon = d.icon;
                    const active = docType === d.key;
                    return (
                      <button
                        key={d.key}
                        id={`kyc-doc-${d.key.toLowerCase()}`}
                        type="button"
                        onClick={() => setDocType(d.key)}
                        className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 text-center transition-all ${active ? "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 scale-[1.02]" : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-emerald-500/40"}`}
                      >
                        <Icon className="w-6 h-6" />
                        <span className="text-xs font-semibold leading-tight">{d.label}</span>
                      </button>
                    );
                  })}
                </div>

                <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2 block">Número de cédula que aparece en el documento</label>
                <input
                  id="kyc-doc-number"
                  type="text"
                  inputMode="numeric"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value.replace(/[^\dVvEe-]/g, "").slice(0, 14))}
                  placeholder="Ej: 23684976"
                  className={`w-full bg-zinc-50 dark:bg-zinc-950 border rounded-xl px-4 py-3 text-lg font-mono tracking-wider outline-none transition-colors ${numberMismatch ? "border-rose-500" : numberMatches ? "border-emerald-500" : "border-zinc-200 dark:border-zinc-800 focus:border-emerald-500"}`}
                />
                <p className={`text-xs mt-2 ${numberMismatch ? "text-rose-500" : (Boolean(profileDoc) && numberMatches) ? "text-emerald-600" : "text-zinc-500"}`}>
                  {numberMismatch
                    ? `No coincide con la cédula de tu perfil (${profileDoc}). Usa un documento con ese número o corrige tu perfil.`
                    : (Boolean(profileDoc) && numberMatches)
                      ? "✓ Coincide con la cédula registrada en tu perfil"
                      : "La cédula, el pasaporte y la licencia llevan el mismo número. Debe coincidir con tu perfil y con tus cuentas bancarias."}
                </p>
              </div>
              <button id="kyc-start-btn" onClick={nextStep} disabled={!docType || digits(docNumber).length < 6} className="mt-8 w-full py-4 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                Comenzar Verificación <ChevronRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-full justify-between"
            >
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">{doc.front}</h2>
                <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">Sube una foto clara y legible donde se vea tu rostro y datos.</p>
                
                <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-3xl p-2 h-48 relative flex items-center justify-center bg-zinc-50 dark:bg-zinc-950/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors group cursor-pointer overflow-hidden">
                  <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setFrontImage, "front")} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  {frontImage ? (
                    <img src={frontImage} alt="Frente" className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    <div className="text-center">
                      <UploadCloud className="w-10 h-10 text-zinc-400 mx-auto mb-2 group-hover:text-emerald-500 transition-colors" />
                      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Toca para subir o tomar foto</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={prevStep} className="py-4 px-6 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-bold rounded-2xl transition-all">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button onClick={nextStep} disabled={!frontImage} className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  Continuar <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-full justify-between"
            >
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">{doc.back}</h2>
                <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">Sube una foto clara de la parte posterior de tu documento.</p>
                
                <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-3xl p-2 h-48 relative flex items-center justify-center bg-zinc-50 dark:bg-zinc-950/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors group cursor-pointer overflow-hidden">
                  <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setBackImage, "back")} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  {backImage ? (
                    <img src={backImage} alt="Dorso" className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    <div className="text-center">
                      <UploadCloud className="w-10 h-10 text-zinc-400 mx-auto mb-2 group-hover:text-emerald-500 transition-colors" />
                      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Toca para subir o tomar foto</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={prevStep} className="py-4 px-6 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-bold rounded-2xl transition-all">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button onClick={nextStep} disabled={!backImage} className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  Continuar <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-full justify-between"
            >
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Prueba de Vida (Selfie)</h2>
                <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">Tómate una foto sosteniendo {doc.selfie} cerca de tu rostro.</p>
                
                <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-3xl p-2 h-48 relative flex items-center justify-center bg-zinc-50 dark:bg-zinc-950/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors group cursor-pointer overflow-hidden">
                  <input type="file" accept="image/*" capture="user" onChange={(e) => handleFileChange(e, setSelfieImage, "selfie")} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  {selfieImage ? (
                    <img src={selfieImage} alt="Selfie" className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    <div className="text-center">
                      <Camera className="w-10 h-10 text-zinc-400 mx-auto mb-2 group-hover:text-emerald-500 transition-colors" />
                      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Abrir Cámara</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={prevStep} disabled={isUploading} className="py-4 px-6 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-bold rounded-2xl transition-all disabled:opacity-50">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button onClick={handleFinish} disabled={!selfieImage || isUploading} className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {isUploading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Leyendo y verificando tu documento…
                    </>
                  ) : "Finalizar y Enviar"}
                </button>
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col h-full items-center justify-center text-center py-8"
            >
              <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-6 relative">
                <motion.div 
                  initial={{ scale: 0 }} 
                  animate={{ scale: 1 }} 
                  transition={{ type: "spring", delay: 0.2 }}
                >
                  <ShieldCheck className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
                </motion.div>
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">¡Documentos Recibidos!</h2>
              <p className="text-zinc-600 dark:text-zinc-400 mb-8 max-w-sm">
                Tu perfil está ahora en estado <strong>Pendiente de Revisión</strong>. Nuestro equipo de cumplimiento verificará tus datos pronto. Ya puedes acceder al panel principal.
              </p>
              <button onClick={() => router.push("/dashboard")} className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-bold rounded-2xl transition-all">
                Ir a mi Panel
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Error Notifications */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md"
          >
            <div className="p-4 rounded-2xl shadow-xl shadow-black/10 border backdrop-blur-md flex items-start gap-3 bg-rose-500/90 border-rose-400 text-white">
              <div className="mt-0.5">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 text-sm font-medium">
                {errorMessage}
              </div>
              <button 
                onClick={() => setErrorMessage(null)}
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
