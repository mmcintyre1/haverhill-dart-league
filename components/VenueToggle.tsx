"use client";

import { useState } from "react";

export default function VenueToggle({
  name,
  address,
  phone,
}: {
  name: string;
  address?: string | null;
  phone?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!(address || phone);

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        className={`text-left leading-snug ${
          hasDetails
            ? "text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            : "text-slate-500 cursor-default"
        }`}
      >
        {name}
        {hasDetails && (
          <span className="ml-1 text-slate-600">{open ? "▴" : "▾"}</span>
        )}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 text-slate-500">
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
