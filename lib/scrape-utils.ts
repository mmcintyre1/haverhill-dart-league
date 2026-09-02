import type { DCGameLeg } from "./dartconnect";

/** Parse DC's notable field for cricket turns.
 *  DC pre-computes effective marks accounting for closed targets.
 *  Format: "6M" = 6 marks, "4B" = 4 bull marks, "9M" = round of 9. */
export function parseCricketNotable(notable: string | null | undefined): { marks: number; bulls: number } {
  if (!notable) return { marks: 0, bulls: 0 };
  const mMatch = notable.match(/^(\d+)M$/);
  if (mMatch) return { marks: parseInt(mMatch[1]), bulls: 0 };
  const bMatch = notable.match(/^(\d+)B$/);
  if (bMatch) return { marks: 0, bulls: parseInt(bMatch[1]) };
  return { marks: 0, bulls: 0 };
}

export function gameType(gameName: string): "601" | "501" | "crkt" | "other" {
  const n = gameName.toLowerCase();
  if (n.includes("601")) return "601";
  if (n.includes("501")) return "501";
  if (n.includes("cricket")) return "crkt";
  return "other";
}

export function setWinner(legs: DCGameLeg[]): 0 | 1 | null {
  if (legs.length === 0) return null;
  let home = 0, away = 0;
  for (const leg of legs) {
    if (leg.winner_index === 0) home++;
    else if (leg.winner_index === 1) away++;
  }
  if (home > away) return 0;
  if (away > home) return 1;
  return null;
}

/** DC's lineups `dc_match_id` field is historically a small integer, but as of
 *  Fall 2026 DC sends the recap hex GUID there instead once a match is played
 *  (confirmed: that value resolves at recap.dartconnect.com/matches/{guid}).
 *  Route each shape to the column it actually fits — `dcMatchId` is integer,
 *  `dcGuid` is the unique-indexed recap identifier also set later from match
 *  history — so we capture the identifier either way instead of dropping it. */
export function parseDcMatchId(id: number | string | null | undefined): { dcMatchId: number | null; dcGuid: string | null } {
  if (id == null) return { dcMatchId: null, dcGuid: null };
  if (typeof id === "number") return Number.isInteger(id) ? { dcMatchId: id, dcGuid: null } : { dcMatchId: null, dcGuid: null };
  if (/^\d+$/.test(id)) return { dcMatchId: Number(id), dcGuid: null };
  if (/^[0-9a-f]{16,32}$/i.test(id)) return { dcMatchId: null, dcGuid: id };
  return { dcMatchId: null, dcGuid: null };
}

export function guidToFakeId(guid: string): number {
  let h = 0;
  for (const c of guid) {
    h = (h * 31 + c.charCodeAt(0)) | 0;
  }
  return h < 0 ? h : ~h;
}
