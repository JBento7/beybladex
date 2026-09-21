/**
 * Single source of truth for the official ranking order.
 *
 * The ranking is driven by league points (TournamentParticipant.rankingPoints
 * earned in official, non-test tournaments), with the display name as the
 * tie-breaker. Players without league points are not ranked.
 *
 * Every surface that shows the official ranking (/rankings, the dashboard
 * widget and /community) must use these helpers so the positions match.
 */
export type RankingEntry = {
  /** Sum of rankingPoints from official, non-test tournaments. */
  leaguePoints: number;
  /** Name as displayed (bladerName ?? name). */
  displayName: string;
};

export function compareRanking(a: RankingEntry, b: RankingEntry): number {
  return b.leaguePoints - a.leaguePoints || a.displayName.localeCompare(b.displayName);
}

export function isRanked(entry: RankingEntry): boolean {
  return entry.leaguePoints > 0;
}
