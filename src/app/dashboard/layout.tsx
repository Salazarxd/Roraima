import React from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { DockNav } from "@/components/dock-nav";
import { SupportChatWidget } from "@/components/support-chat-widget";
import { TradeNotifier } from "@/components/trade-notifier";
import { GlobalMascot } from "@/components/global-mascot";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <React.Suspense fallback={null}>
        <DashboardHeader />
      </React.Suspense>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-32 sm:pb-36">
        {children}
      </main>
      <SupportChatWidget />
      <React.Suspense fallback={null}>
        <GlobalMascot />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <TradeNotifier />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <DockNav />
      </React.Suspense>
    </div>
  );
}
