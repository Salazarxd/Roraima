"use client";

import * as React from "react";
import { motion, type Variants } from "framer-motion";
import { ShieldAlert, RefreshCw, AlertTriangle, CheckCircle2, ShieldBan, FileText, Search, Loader2 } from "lucide-react";
import { getGlobalLedger, runLedgerAudit, getLedgerReport, LedgerEntry } from "@/app/actions/ledger";
import { getIdToken } from "@/lib/client-auth";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export function LedgerTab({ toast }: { toast: (type: "error" | "success", t: string) => void }) {
  const [view, setView] = React.useState<"LOGS" | "SCAN">("LOGS");
  const [logs, setLogs] = React.useState<LedgerEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [scanning, setScanning] = React.useState(false);
  const [scanResult, setScanResult] = React.useState<{
    anomalies: any[];
    suspendedUsers: string[];
  } | null>(null);

  const [selectedUser, setSelectedUser] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<any>(null);

  const loadLogs = React.useCallback(async () => {
    setLoading(true);
    const token = await getIdToken();
    const res = await getGlobalLedger(token);
    if (res.success && res.data) {
      setLogs(res.data);
    } else {
      toast("error", res.error || "Error al cargar libro mayor");
    }
    setLoading(false);
  }, [toast]);

  React.useEffect(() => {
    if (view === "LOGS") loadLogs();
  }, [view, loadLogs]);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    const token = await getIdToken();
    const res = await runLedgerAudit(token);
    if (res.success) {
      setScanResult({
        anomalies: res.anomalies,
        suspendedUsers: res.suspendedUsers
      });
      if (res.suspendedUsers.length > 0) {
        toast("error", `¡Se detectaron ${res.anomalies.length} anomalías y se suspendieron cuentas!`);
      } else {
        toast("success", "Escaneo completo. No se detectaron anomalías.");
      }
    } else {
      toast("error", res.error || "Error al ejecutar auditoría");
    }
    setScanning(false);
  };

  const handleReport = async (userId: string) => {
    setSelectedUser(userId);
    setReport(null);
    const token = await getIdToken();
    const res = await getLedgerReport(token, userId);
    if (res.success) {
      setReport(res);
    } else {
      toast("error", res.error || "Error al generar informe");
      setSelectedUser(null);
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" exit="hidden" className="space-y-6">
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-zinc-900 rounded-[2rem] p-6 shadow-sm border border-zinc-200/50 dark:border-zinc-800/50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Libro Mayor y Anti-Hack Shield</h2>
            <p className="text-sm text-zinc-500">Registro inmutable de transacciones y escáner de anomalías</p>
          </div>
        </div>
        <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
          <button onClick={() => setView("LOGS")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === "LOGS" ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow" : "text-zinc-500"}`}>Últimos Registros</button>
          <button onClick={() => setView("SCAN")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === "SCAN" ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow" : "text-zinc-500"}`}>Anti-Hack Shield</button>
        </div>
      </motion.div>

      {view === "LOGS" && (
        <motion.div variants={itemVariants} className="bg-white dark:bg-zinc-900 rounded-[2rem] overflow-hidden shadow-sm border border-zinc-200/50 dark:border-zinc-800/50">
          <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
            <h3 className="font-bold text-zinc-900 dark:text-zinc-50">Transacciones Globales</h3>
            <button onClick={loadLogs} disabled={loading} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
              <RefreshCw className={`w-4 h-4 text-zinc-600 dark:text-zinc-400 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 dark:text-zinc-400 text-xs uppercase font-bold">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Usuario</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4 text-right">Monto</th>
                  <th className="px-6 py-4">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {logs.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                    <td className="px-6 py-4 font-mono text-[10px] text-zinc-400">{t.id.slice(0, 13)}...</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-zinc-900 dark:text-zinc-50">{t.userEmail}</div>
                    </td>
                    <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400 text-xs font-semibold">{t.type}</td>
                    <td className={`px-6 py-4 text-right font-bold ${t.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {t.amount > 0 ? "+" : ""}{t.amount.toFixed(2)} {t.currency}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 text-xs">{new Date(t.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {logs.length === 0 && !loading && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-zinc-500">No hay registros</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {view === "SCAN" && (
        <motion.div variants={itemVariants} className="space-y-6">
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 sm:p-8 shadow-sm border border-zinc-200/50 dark:border-zinc-800/50 text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mx-auto mb-4 border-4 border-indigo-100 dark:border-indigo-900/50">
              <Search className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Escáner de Integridad</h3>
            <p className="text-sm text-zinc-500 max-w-lg mx-auto mb-6">
              El escáner audita todos los balances de las billeteras cruzándolos con la sumatoria estricta del Libro Mayor. Si detecta alteraciones (por ej. balances modificados ilícitamente), la cuenta se suspende de inmediato.
            </p>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
            >
              {scanning ? <><Loader2 className="w-5 h-5 animate-spin" /> Escaneando base de datos...</> : <><RefreshCw className="w-5 h-5" /> Ejecutar Auditoría Global</>}
            </button>
          </div>

          {scanResult && scanResult.anomalies.length === 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-6 text-center text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3" />
              <h4 className="font-bold text-lg">Sistema Íntegro</h4>
              <p className="text-sm mt-1">Todas las billeteras coinciden exactamente con el Libro Mayor. Ninguna alteración detectada.</p>
            </div>
          )}

          {scanResult && scanResult.anomalies.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-[2rem] shadow-sm border border-rose-200 dark:border-rose-900/50 overflow-hidden">
              <div className="bg-rose-50 dark:bg-rose-950/50 p-6 flex items-start gap-4 border-b border-rose-100 dark:border-rose-900/50">
                <ShieldBan className="w-8 h-8 text-rose-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-rose-700 dark:text-rose-400 text-lg">¡Atención! {scanResult.anomalies.length} Anomalía(s) Encontrada(s)</h4>
                  <p className="text-sm text-rose-600 dark:text-rose-300 mt-1">
                    Las siguientes cuentas presentaron balances que no concuerdan con sus transacciones reales. Han sido marcadas como SUSPENDIDAS preventivamente.
                  </p>
                </div>
              </div>
              <div className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 text-xs font-bold uppercase">
                    <tr>
                      <th className="px-6 py-4">Usuario</th>
                      <th className="px-6 py-4 text-right">Balance Alterado</th>
                      <th className="px-6 py-4 text-right">Balance Real (Libro)</th>
                      <th className="px-6 py-4 text-right">Diferencia</th>
                      <th className="px-6 py-4 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {scanResult.anomalies.map((a: any) => (
                      <tr key={a.userId} className="bg-rose-50/20 dark:bg-rose-900/10">
                        <td className="px-6 py-4 font-bold text-zinc-900 dark:text-zinc-50">{a.email}</td>
                        <td className="px-6 py-4 text-right text-rose-600 dark:text-rose-400 font-bold">{a.statedBalance.toFixed(2)}</td>
                        <td className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400 font-bold">{a.trueBalance.toFixed(2)}</td>
                        <td className="px-6 py-4 text-right font-bold text-zinc-900 dark:text-zinc-50">{a.diff.toFixed(2)}</td>
                        <td className="px-6 py-4 text-center">
                          <button onClick={() => handleReport(a.userId)} className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center justify-center gap-1 mx-auto">
                            <FileText className="w-4 h-4" /> Ver Informe
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Modal de informe de anomalía */}
          {selectedUser && report && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/50 dark:bg-black/60 backdrop-blur-sm">
              <div className="bg-white dark:bg-zinc-900 rounded-[2rem] w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950/50">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-indigo-600" />
                    <div>
                      <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-lg">Informe de Auditoría</h3>
                      <p className="text-xs text-zinc-500">{report.user.email}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedUser(null)} className="text-zinc-400 hover:text-zinc-600 font-bold text-xl">&times;</button>
                </div>
                <div className="p-6 bg-rose-50 dark:bg-rose-950/20 flex gap-4">
                  <AlertTriangle className="w-10 h-10 text-rose-500 shrink-0" />
                  <div>
                    <h4 className="font-bold text-rose-800 dark:text-rose-300">Resumen del Desfase</h4>
                    <p className="text-sm text-rose-700 dark:text-rose-400">
                      Balance en billetera: <b>{report.walletBalance.toFixed(2)}</b> USDT<br/>
                      Balance calculado real: <b>{report.calculatedBalance.toFixed(2)}</b> USDT
                    </p>
                    <p className="text-xs mt-2 font-bold text-rose-600">El estado del usuario es: {report.user.status}</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-0">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-500 text-xs sticky top-0">
                      <tr>
                        <th className="px-6 py-3">Fecha</th>
                        <th className="px-6 py-3">Tipo</th>
                        <th className="px-6 py-3 text-right">Monto</th>
                        <th className="px-6 py-3 text-right">Saldo Corriente</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {report.history.map((h: any) => (
                        <tr key={h.id}>
                          <td className="px-6 py-3 text-xs text-zinc-500">{new Date(h.createdAt).toLocaleString()}</td>
                          <td className="px-6 py-3 font-semibold text-zinc-700 dark:text-zinc-300">{h.type}</td>
                          <td className={`px-6 py-3 text-right font-bold ${h.amount > 0 ? "text-emerald-500" : "text-rose-500"}`}>{h.amount > 0 ? "+" : ""}{h.amount.toFixed(2)}</td>
                          <td className="px-6 py-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">{h.runningBalance.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
