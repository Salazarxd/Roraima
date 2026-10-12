import type { Metadata, Viewport } from "next";
import React, { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { SettingsProvider } from "@/components/settings-provider";
import { IntroVideoModal } from "@/components/intro-video-modal";
import { NetworkStatusBanner } from "@/components/network-status-banner";
import { getSystemSettings } from "@/lib/settings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSystemSettings();
  return {
    title: s.appName,
    description: "Intercambia USDT/USDC a Bolívares sin fricción.",
    manifest: "/manifest.json",
    icons: {
      icon: s.logoUrl,
      apple: s.logoUrl,
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: s.appName,
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#10b981" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/** Async wrapper that fetches settings and provides them via context */
async function SettingsWrapper({ children }: { children: React.ReactNode }) {
  const settings = await getSystemSettings();
  return (
    <SettingsProvider settings={settings}>
      <NetworkStatusBanner />
      <IntroVideoModal />
      {children}
      <PWAInstallPrompt />
    </SettingsProvider>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50 transition-colors duration-500">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <Suspense fallback={null}>
            <SettingsWrapper>{children}</SettingsWrapper>
          </Suspense>
          <Toaster richColors position="top-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
