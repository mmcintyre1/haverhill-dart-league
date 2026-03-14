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

export function guidToFakeId(guid: string): number {
  let h = 0;
  for (const c of guid) {
    h = (h * 31 + c.charCodeAt(0)) | 0;
  }
  return h < 0 ? h : ~h;
}
