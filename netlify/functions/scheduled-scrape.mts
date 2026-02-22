// Netlify Scheduled Function — runs Wednesday 6am ET (11:00 UTC)
// Triggers the /api/scrape endpoint to refresh DartConnect data after Tuesday night play.

import type { Config } from "@netlify/functions";

export const config: Config = {
  schedule: "0 11 * * 3", // Wednesday 11:00 UTC = 6:00 AM ET
};

export default async function handler() {
  const baseUrl = process.env.URL ?? process.env.DEPLOY_URL;
  if (!baseUrl) {
    console.error("No site URL found in environment");
    return;
  }

  const secret = process.env.SCRAPE_SECRET ?? "";

  try {
    const res = await fetch(`${baseUrl}/api/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Triggered-By": "scheduled",
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    if (res.ok) {
      console.log(
        `Scrape success: ${data.playersUpdated} players, ${data.matchesUpdated} matches (season ${data.seasonId})`
      );
    } else {
      console.error("Scrape failed:", data.error);
    }
  } catch (err) {
    console.error("Scrape request threw:", err);
  }
}
