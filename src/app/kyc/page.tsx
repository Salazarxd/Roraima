import { Navbar } from "@/components/navbar";
import { KycWizard } from "@/components/kyc-wizard";
import { Footer } from "@/components/footer";

export default function KycPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-32 pb-20 px-4 flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl -z-10" />
        
        <KycWizard />
      </main>
      <Footer />
    </>
  );
}
