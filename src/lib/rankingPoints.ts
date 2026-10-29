// Ranking points awarded by an event's final placement.
//
// points = base points of the placement × multiplier. The multiplier is 2 for a
// "Pontuação dobrada" event and 1 otherwise. Always computed from the BASE
// table (never from stored points), so finalizing or recalculating again can't
// double points that were already doubled. Battle points, sets, Swiss points
// and tiebreaks are not affected.
// No imports: unit-tested directly by Node (tests/rankingPoints.test.ts).

/** Base ranking points of the top 5 placements (index 0 = 1st place). */
export const RANKING_POINTS_BY_PLACE = [100, 70, 50, 30, 10];

type DoubleFlags = { isOfficial: boolean; isTest?: boolean | null; doubleRankingPoints?: boolean | null };

/** "Pontuação dobrada" can only be turned on for official events (the ones
 *  that score in the ranking), never for a BeyEncontro. */
export function canDoubleRankingPoints(t: { isOfficial: boolean }): boolean {
  return t.isOfficial;
}

/** Where an already-set flag still applies: official events, and the admin's
 *  test copy of one (it keeps the option so the rehearsal shows the real
 *  points; test events never reach the ranking). */
function keepsDoubleRankingPoints(t: { isOfficial: boolean; isTest?: boolean | null }): boolean {
  return t.isOfficial || !!t.isTest;
}

/** 2 for a valid "Pontuação dobrada" event, 1 otherwise. */
export function rankingMultiplier(t: DoubleFlags): 1 | 2 {
  return t.doubleRankingPoints && keepsDoubleRankingPoints(t) ? 2 : 1;
}

/** Points for a 0-based placement index; 0 outside the top 5 or when the
 *  player isn't eligible (e.g. didn't reach the knockout). */
export function placementRankingPoints(index: number, multiplier: number, eligible = true): number {
  if (!eligible) return 0;
  return (RANKING_POINTS_BY_PLACE[index] ?? 0) * multiplier;
}

/**
 * Server-side decision for create/edit: only organizers (admins) may turn it
 * on, and only where allowed. `requested` undefined = field not sent → keep
 * the current value (dropped if the event no longer allows it, e.g. it became
 * a BeyEncontro).
 */
export function resolveDoubleRankingPoints(input: {
  requested: unknown;
  isAdmin: boolean;
  event: { isOfficial: boolean; isTest?: boolean | null };
  current?: boolean;
}): { ok: true; value: boolean } | { ok: false; status: 400 | 403; error: string } {
  const kept = !!input.current && keepsDoubleRankingPoints(input.event);
  if (input.requested === undefined || input.requested === null) return { ok: true, value: kept };
  if (typeof input.requested !== "boolean") return { ok: false, status: 400, error: "Valor inválido para pontuação dobrada." };
  if (!input.requested) return { ok: true, value: false };
  if (kept) return { ok: true, value: true }; // unchanged (e.g. saving a test copy)
  if (!input.isAdmin) return { ok: false, status: 403, error: "Apenas administradores podem ativar a pontuação dobrada." };
  if (!canDoubleRankingPoints(input.event)) return { ok: false, status: 400, error: "Pontuação dobrada só vale para eventos oficiais que pontuam no ranking." };
  return { ok: true, value: true };
}
