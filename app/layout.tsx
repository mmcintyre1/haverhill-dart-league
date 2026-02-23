import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Haverhill Dart League",
  description: "Stats, schedule, and results for the Haverhill Dart League",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#0a0f1e] text-slate-200 antialiased">
        <header className="bg-slate-900/95 border-b border-slate-800 backdrop-blur-sm sticky top-0 z-10">
          {/* Amber accent line */}
          <div className="h-[2px] bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600" />
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-amber-400 text-lg select-none">◎</span>
              <div>
                <span className="text-base font-semibold tracking-tight text-white">
                  Haverhill Dart League
                </span>
              </div>
            </div>
            <nav className="flex gap-1 text-sm font-medium">
              {[
                { href: "/", label: "Home" },
                { href: "/leaderboard", label: "Leaderboard" },
                { href: "/standings", label: "Standings" },
                { href: "/matches", label: "Matches" },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mt-16 border-t border-slate-800 py-4 text-center text-xs text-slate-600">
          Data sourced from{" "}
          <a
            href="https://tv.dartconnect.com/league/HaverDL"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-400 transition-colors"
          >
            DartConnect
          </a>
        </footer>
      </body>
    </html>
  );
}
