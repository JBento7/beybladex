// Match rules (sets per match / points to win a set) per phase.
//
// Every tournament is a single day. A Suíço with a cut has two phases, each
// with its own rules:
//  - Swiss phase → Tournament.setsToWin / pointsToWinSet;
//  - knockout (every round, final and 3rd place) → Tournament.day2SetsToWin /
//    day2PointsToWinSet. The "day2" names are historical (they used to be the
//    rules of a second day); they are only the knockout rules now, whatever
//    isMultiDay says. Null = no specific knockout rules → the main ones apply.
// Old events keep isMultiDay/day2Date untouched (history); nothing reads them
// to decide which rules apply.
// No imports: unit-tested directly by Node (tests/matchRules.test.ts).

export const SETS_OPTIONS = [1, 2] as const; // 1 set · melhor de 3
export const POINTS_OPTIONS = [4, 5, 6, 7] as const;

export type PhaseRules = { setsToWin: number; pointsToWinSet: number };

/** Formats with a Swiss phase followed by a knockout (= lib/swiss isSwissFormat). */
export function hasKnockoutPhase(format: string | null | undefined): boolean {
  return format === "ROUND_ROBIN" || format === "SWISS";
}

/** Missing → fallback; a value outside the allowed options → "invalid". */
export function parseRuleValue(value: unknown, options: readonly number[], fallback: number | null): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isInteger(n) && options.includes(n) ? n : "invalid";
}

/** Validates the rules sent by the create/edit forms. Knockout rules only
 *  exist for formats with two phases (other formats → null). */
export function parseMatchRules(
  body: { format?: string; setsToWin?: unknown; pointsToWinSet?: unknown; day2SetsToWin?: unknown; day2PointsToWinSet?: unknown },
  defaults: { setsToWin: number; pointsToWinSet: number; knockoutSets: number | null; knockoutPoints: number | null } = { setsToWin: 2, pointsToWinSet: 4, knockoutSets: null, knockoutPoints: null }
): { ok: true; setsToWin: number; pointsToWinSet: number; knockoutSets: number | null; knockoutPoints: number | null } | { ok: false; error: string } {
  const setsToWin = parseRuleValue(body.setsToWin, SETS_OPTIONS, defaults.setsToWin);
  const pointsToWinSet = parseRuleValue(body.pointsToWinSet, POINTS_OPTIONS, defaults.pointsToWinSet);
  if (setsToWin === "invalid" || setsToWin === null) return { ok: false, error: "Sets por partida inválidos. Use 1 set ou melhor de 3." };
  if (pointsToWinSet === "invalid" || pointsToWinSet === null) return { ok: false, error: "Pontos para vencer o set inválidos. Use de 4 a 7." };
  if (!hasKnockoutPhase(body.format)) return { ok: true, setsToWin, pointsToWinSet, knockoutSets: null, knockoutPoints: null };
  const knockoutSets = parseRuleValue(body.day2SetsToWin, SETS_OPTIONS, defaults.knockoutSets);
  const knockoutPoints = parseRuleValue(body.day2PointsToWinSet, POINTS_OPTIONS, defaults.knockoutPoints);
  if (knockoutSets === "invalid") return { ok: false, error: "Sets por partida do mata-mata inválidos. Use 1 set ou melhor de 3." };
  if (knockoutPoints === "invalid") return { ok: false, error: "Pontos para vencer o set do mata-mata inválidos. Use de 4 a 7." };
  return { ok: true, setsToWin, pointsToWinSet, knockoutSets, knockoutPoints };
}

/** Rules of the knockout phase, falling back to the main rules (old events
 *  without specific knockout rules). */
export function knockoutRules(t: { setsToWin: number; pointsToWinSet: number; day2SetsToWin?: number | null; day2PointsToWinSet?: number | null }): PhaseRules {
  return { setsToWin: t.day2SetsToWin ?? t.setsToWin, pointsToWinSet: t.day2PointsToWinSet ?? t.pointsToWinSet };
}

/** "melhor de 3 sets" / "set único". */
export function setsLabel(setsToWin: number): string {
  return setsToWin > 1 ? `melhor de ${setsToWin * 2 - 1} sets` : "set único";
}
