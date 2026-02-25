"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/standings", label: "Standings" },
  { href: "/teams", label: "Teams" },
  { href: "/matches", label: "Matches" },
  { href: "/about", label: "About" },
];

export default function NavLinks() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex gap-1 text-sm font-medium">
        {NAV.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded transition-colors ${
                active
                  ? "text-amber-400 bg-slate-800/60"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile hamburger */}
      <button
        className="md:hidden flex flex-col justify-center gap-[5px] w-8 h-8 text-slate-400 hover:text-white"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle navigation"
      >
        <span className={`block h-0.5 bg-current transition-all duration-200 ${open ? "translate-y-[7px] rotate-45" : ""}`} />
        <span className={`block h-0.5 bg-current transition-all duration-200 ${open ? "opacity-0" : ""}`} />
        <span className={`block h-0.5 bg-current transition-all duration-200 ${open ? "-translate-y-[7px] -rotate-45" : ""}`} />
      </button>

      {/* Mobile dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 md:hidden z-20">
          {NAV.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`block px-5 py-3.5 text-sm font-medium border-b border-slate-800/60 last:border-0 transition-colors ${
                  active
                    ? "text-amber-400 bg-slate-800/40"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/40"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
