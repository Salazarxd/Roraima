import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { LandingDataProvider } from "@/components/landing/landing-data";
import { LandingHero } from "@/components/landing/hero";
import { RatesTicker, MarketPreview, HowItWorks, SecurityBento, StatsBand, Faq, FinalCta } from "@/components/landing/sections";

export async function generateMetadata(): Promise<Metadata> {
  const { getSystemSettings } = await import("@/lib/settings");
  const s = await getSystemSettings();
  return {
  title: `${s.appName} · Compra y vende USDT de forma segura`,
    icons: { icon: s.logoUrl, apple: s.logoUrl },
  description:
    "Mercado P2P de USDT para Venezuela con Escrow en cada orden, identidad verificada, Pago Móvil y transferencias. 0% de comisión al tomar anuncios.",
  openGraph: {
    title: `${s.appName} · P2P de USDT en Venezuela`,
    description: "Compra y vende USDT con bolívares. Escrow en cada orden, KYC y soporte humano.",
    images: [s.logoUrl],
    locale: "es_VE",
    type: "website",
  },
};
}

export default function Home() {
  return (
    <LandingDataProvider>
      <Navbar />
      <main className="flex-grow overflow-x-clip">
        <LandingHero />
        <RatesTicker />
        <MarketPreview />
        <StatsBand />
        <HowItWorks />
        <SecurityBento />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </LandingDataProvider>
  );
}
