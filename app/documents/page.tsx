import { db, documents } from "@/lib/db";
import { asc } from "drizzle-orm";
import { groupDocumentsByCategory } from "@/lib/documents";

export const revalidate = 86400;

async function getDocuments() {
  return db.select().from(documents).orderBy(asc(documents.sortOrder), asc(documents.title));
}

export default async function DocumentsPage() {
  const rows = await getDocuments();
  const groups = groupDocumentsByCategory(rows);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Documents</h1>
        <p className="text-slate-500 text-sm">League rules, forms, and other resources.</p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 py-16 text-center text-slate-500">
          <p className="text-3xl mb-3 select-none">📄</p>
          <p className="font-medium">No documents yet</p>
          <p className="text-sm mt-1">Check back soon.</p>
        </div>
      ) : (
        groups.map(([category, docs]) => (
          <section key={category}>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-base font-semibold text-slate-100">{category}</h2>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800">
              {docs.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-5 py-3.5 bg-slate-900 hover:bg-slate-800/60 transition-colors group"
                >
                  {/* File icon */}
                  <svg className="shrink-0 mt-0.5 text-slate-500 group-hover:text-amber-400 transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{doc.title}</p>
                    {doc.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{doc.description}</p>
                    )}
                  </div>
                  {/* External link indicator */}
                  <svg className="shrink-0 mt-0.5 text-slate-600 group-hover:text-slate-400 transition-colors" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
