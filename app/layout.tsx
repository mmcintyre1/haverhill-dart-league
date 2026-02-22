import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

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
    <html lang="en">
      <body className="min-h-screen bg-slate-900 text-slate-100 antialiased">
        <header className="bg-slate-800 border-b border-slate-700 shadow-lg">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Haverhill Dart League
              </h1>
            </div>
            <nav className="flex gap-6 text-sm font-medium">
              <Link href="/" className="text-slate-300 hover:text-sky-400 transition-colors">
                Leaderboard
              </Link>
              <Link href="/schedule" className="text-slate-300 hover:text-sky-400 transition-colors">
                Schedule
              </Link>
              <Link href="/results" className="text-slate-300 hover:text-sky-400 transition-colors">
                Results
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mt-12 border-t border-slate-700 py-4 text-center text-xs text-slate-500">
          Data sourced from{" "}
          <a
            href="https://tv.dartconnect.com/league/HaverDL"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-300 transition-colors"
          >
            DartConnect
          </a>
        </footer>
      </body>
    </html>
  );
}
