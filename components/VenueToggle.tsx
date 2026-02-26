"use client";

import { useState } from "react";

export default function VenueToggle({
  name,
  address,
  phone,
  showCity = true,
}: {
  name: string;
  address?: string | null;
  phone?: string | null;
  showCity?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!(address || phone);

  // Extract city from normalized "Street, City, MA Zip" address
  const cityPart = address ? address.split(",")[1]?.trim() : null;
  const city = cityPart && /^[A-Za-z]/.test(cityPart) ? cityPart : null;

  return (
    <div className="text-xs min-w-0">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        className={`text-left w-full flex items-center gap-1 min-w-0 leading-snug ${
          hasDetails
            ? "hover:opacity-80 transition-opacity cursor-pointer"
            : "cursor-default"
        }`}
      >
        <svg className="shrink-0 text-slate-400" width="11" height="13" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2C7.58 2 4 5.58 4 10c0 6.5 8 16 8 16s8-9.5 8-16c0-4.42-3.58-8-8-8z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <span className="truncate text-amber-400">{name}</span>
        {showCity && city && (
          <span className="text-white shrink-0">· {city}</span>
        )}
        {hasDetails && (
          <span className="text-slate-500 shrink-0">{open ? "▴" : "▾"}</span>
        )}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 text-slate-500 pl-4">
          {address && <p>{address}</p>}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="block hover:text-slate-300 transition-colors"
            >
              {phone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
