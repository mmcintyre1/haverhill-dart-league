import { db, seasons } from "@/lib/db";
import { desc } from "drizzle-orm";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const allSeasons = await db
    .select({ id: seasons.id, name: seasons.name, isActive: seasons.isActive, lastScrapedAt: seasons.lastScrapedAt })
    .from(seasons)
    .orderBy(desc(seasons.startDate));

  // Pass secret to client so it can authenticate API calls from the admin UI.
  // The admin page itself has no auth for now — add page-level auth when needed.
  const secret = process.env.SCRAPE_SECRET ?? "";

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-100 mb-6">Admin</h1>
      <AdminPanel seasons={allSeasons} secret={secret} />
    </div>
  );
}
