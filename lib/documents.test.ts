import { describe, it, expect } from "vitest";
import { groupDocumentsByCategory, type DocumentRow } from "./documents";

const make = (overrides: Partial<DocumentRow> = {}): DocumentRow => ({
  id: 1,
  title: "League Rules",
  url: "https://example.com/rules.pdf",
  category: "Rules",
  description: null,
  sortOrder: 0,
  publishedAt: new Date("2026-01-01"),
  ...overrides,
});

describe("groupDocumentsByCategory", () => {
  it("groups documents by category", () => {
    const docs = [
      make({ id: 1, category: "Rules" }),
      make({ id: 2, category: "Forms" }),
      make({ id: 3, category: "Rules" }),
    ];
    const groups = groupDocumentsByCategory(docs);
    expect(groups).toHaveLength(2);
    const ruleGroup = groups.find(([cat]) => cat === "Rules");
    expect(ruleGroup?.[1]).toHaveLength(2);
  });

  it("sorts categories alphabetically", () => {
    const docs = [
      make({ id: 1, category: "Rules" }),
      make({ id: 2, category: "Forms" }),
      make({ id: 3, category: "General" }),
    ];
    const groups = groupDocumentsByCategory(docs);
    expect(groups.map(([cat]) => cat)).toEqual(["Forms", "General", "Rules"]);
  });

  it("sorts documents within a category by sortOrder then title", () => {
    const docs = [
      make({ id: 1, title: "Z Doc", sortOrder: 0, category: "Rules" }),
      make({ id: 2, title: "A Doc", sortOrder: 1, category: "Rules" }),
      make({ id: 3, title: "M Doc", sortOrder: 0, category: "Rules" }),
    ];
    const [[, ruleDocs]] = groupDocumentsByCategory(docs);
    expect(ruleDocs.map((d) => d.id)).toEqual([3, 1, 2]);
  });

  it("returns empty array for no documents", () => {
    expect(groupDocumentsByCategory([])).toEqual([]);
  });
});
