import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: process.env.LEAGUE_NAME ?? "Haverhill Dart League",
    short_name: "HDL Stats",
    description: "Stats, standings, and results",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0f1e",
    theme_color: "#f59e0b",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
