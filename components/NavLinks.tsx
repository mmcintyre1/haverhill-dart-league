"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/standings", label: "Standings" },
  { href: "/matches", label: "Matches" },
  { href: "/about", label: "About" },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 text-sm font-medium">
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
  );
}
