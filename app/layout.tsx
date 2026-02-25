import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import NavLinks from "@/components/NavLinks";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const LEAGUE_NAME = process.env.LEAGUE_NAME ?? "Dart League";

export const metadata: Metadata = {
  title: LEAGUE_NAME,
  description: `Stats, schedule, and results for the ${LEAGUE_NAME}`,
  themeColor: "#f59e0b",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HDL Stats",
  },
  icons: { apple: "/icons/icon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#0a0f1e] text-slate-200 antialiased">
        <ServiceWorkerRegistrar />
        <header className="bg-slate-900/80 border-b border-slate-800 backdrop-blur-sm sticky top-0 z-10 relative">
          {/* Amber accent line */}
          <div className="h-[2px] bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600" />
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-amber-400 text-lg select-none">◎</span>
              <div>
                <span className="text-base font-semibold tracking-tight text-white">
                  {LEAGUE_NAME}
                </span>
              </div>
            </div>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mt-16 border-t border-slate-800 py-6 text-center text-xs text-slate-600">
          <p className="mb-1">{LEAGUE_NAME} &middot; {new Date().getFullYear()}</p>
          <p>
            Data sourced from{" "}
            <a
              href={`https://tv.dartconnect.com/league/${process.env.DC_LEAGUE_ID ?? ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-400 transition-colors"
            >
              DartConnect
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
