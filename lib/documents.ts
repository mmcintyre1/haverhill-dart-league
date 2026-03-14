export type DocumentRow = {
  id: number;
  title: string;
  url: string;
  category: string;
  description: string | null;
  sortOrder: number;
  publishedAt: Date;
};

/**
 * Group documents by category, sorted alphabetically by category name.
 * Within each category, documents are sorted by sortOrder ASC then title ASC.
 */
export function groupDocumentsByCategory(
  docs: DocumentRow[]
): [string, DocumentRow[]][] {
  const map = new Map<string, DocumentRow[]>();
  for (const doc of docs) {
    if (!map.has(doc.category)) map.set(doc.category, []);
    map.get(doc.category)!.push(doc);
  }
  for (const group of map.values()) {
    group.sort((a, b) =>
      a.sortOrder !== b.sortOrder
        ? a.sortOrder - b.sortOrder
        : a.title.localeCompare(b.title)
    );
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}
