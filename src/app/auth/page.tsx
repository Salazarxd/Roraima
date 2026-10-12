import { Navbar } from "@/components/navbar";
import { AuthForm } from "@/components/auth-form";
import { Footer } from "@/components/footer";

export default function AuthPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-32 pb-20 px-4 flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl -z-10" />
        
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Bienvenido a Roraima Exchange</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Accede a tu cuenta o regístrate para comenzar a operar.</p>
        </div>
        
        <AuthForm />
      </main>
      <Footer />
    </>
  );
}
