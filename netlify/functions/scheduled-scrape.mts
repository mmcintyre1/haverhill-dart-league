// Netlify Scheduled Function — runs Wed + Thu 09:00 UTC (5:00 AM EDT)
// Calls scrape-background directly to avoid fire-and-forget issues in /api/scrape.
// Background function returns 202 immediately; actual scrape runs up to 15 min.

import type { Config } from "@netlify/functions";

export const config: Config = {
  schedule: "0 9 * * 3,4", // Wed + Thu 09:00 UTC = 05:00 AM EDT (06:00 AM EST in winter)
};

export default async function handler() {
  const baseUrl = (process.env.URL ?? process.env.DEPLOY_URL ?? "").replace(/\/$/, "");
  if (!baseUrl) {
    console.error("No site URL found in environment");
    return;
  }

  const secret = process.env.SCRAPE_SECRET ?? "";
  const bgUrl = `${baseUrl}/.netlify/functions/scrape-background`;

  try {
    const res = await fetch(bgUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ triggeredBy: "scheduled" }),
    });

    if (res.status === 202) {
      console.log("Scrape background function triggered successfully");
    } else {
      console.error("Unexpected status from scrape-background:", res.status);
    }
  } catch (err) {
    console.error("Failed to trigger scrape-background:", err);
  }
}
