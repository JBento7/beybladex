// Pure standings math, shared by the tournament engine (stored totals, knockout
// seeding, final placement) and the tournament page (tables). No imports on
// purpose: it is unit-tested directly with Node's test runner.
//
// Vocabulary (also used for the on-screen labels):
//  - Swiss points ("Pts suíço"): 1 per win in a Swiss round + 1 per bye.
//  - Battle points ("Pts de batalha"): finish points scored inside matches
//    (Spin 1, Over/Burst 2, Xtreme 3...). Tiebreaker #1.
//  - Balance ("Saldo"): battle points scored − conceded. Tiebreaker #2.
//  - Complete tie: nickname in alphabetical order (pt-BR), then internal id.
//    Explicit on purpose — the order rows come back from the database is NOT
//    a tiebreaker (it used to be, and the Swiss table and the saved final
//    placement each fell back to a different query order).
// A bye is a self-match (player1 = player2) marked isWalkover with the player
// as winner. Knockout padding byes are self-matches WITHOUT isWalkover.
// A W.O. between two players counts as a played win/loss; points recorded
// before the walkover are kept but are not battle points.

export type StandingsMatch = {
  round: number;
  status: string; // "FINISHED" counts; anything else is ignored
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  isWalkover?: boolean;
  isThirdPlace?: boolean;
  points?: { userId: string; points: number }[];
};

export type SwissRow = {
  userId: string;
  swissPoints: number;
  wins: number; // played Swiss matches won (W.O. counts as a win, bye does not)
  losses: number;
  byes: number;
  played: number; // Swiss matches played (byes excluded)
  battlePoints: number;
  conceded: number;
  balance: number;
  /** Nickname used for the alphabetical tiebreak (falls back to the id). */
  name: string;
};

/** Display names for the alphabetical tiebreak: userId → nickname. */
export type NameLookup = Map<string, string> | Record<string, string>;
const nameIn = (names: NameLookup | undefined, id: string) =>
  (names instanceof Map ? names.get(id) : names?.[id]) ?? id;
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** A match belongs to the Swiss phase when its round is within the Swiss rounds. */
export function isSwissMatch(m: Pick<StandingsMatch, "round" | "isThirdPlace">, swissRounds: number): boolean {
  return !m.isThirdPlace && m.round >= 1 && m.round <= swissRounds;
}

export function isSwissBye(m: StandingsMatch): boolean {
  return m.player1Id === m.player2Id && !!m.isWalkover;
}

/**
 * THE Swiss ordering, used by every table and by the engine:
 * Swiss points → battle points → balance → nickname (A→Z) → id.
 * Fully deterministic: never depends on input/database order.
 */
export function compareSwissRows(a: SwissRow, b: SwissRow): number {
  if (b.swissPoints !== a.swissPoints) return b.swissPoints - a.swissPoints;
  if (b.battlePoints !== a.battlePoints) return b.battlePoints - a.battlePoints;
  if (b.balance !== a.balance) return b.balance - a.balance;
  return collator.compare(a.name, b.name) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);
}

/** Which criterion separated two adjacent rows (for explanations on screen). */
export function tiebreakBetween(a: SwissRow, b: SwissRow): "pontos" | "batalha" | "saldo" | "alfabetica" {
  if (a.swissPoints !== b.swissPoints) return "pontos";
  if (a.battlePoints !== b.battlePoints) return "batalha";
  if (a.balance !== b.balance) return "saldo";
  return "alfabetica";
}

/**
 * Standings of the Swiss phase ONLY. Knockout rounds (round > swissRounds) and
 * the third-place match never count, so the table keeps showing the result of
 * the Swiss phase after the bracket is played. Players are returned sorted by
 * compareSwissRows (deterministic, independent of input order).
 */
export function computeSwissStandings(userIds: string[], matches: StandingsMatch[], swissRounds: number, names?: NameLookup): SwissRow[] {
  const rows = new Map<string, SwissRow>();
  for (const id of userIds) {
    rows.set(id, { userId: id, swissPoints: 0, wins: 0, losses: 0, byes: 0, played: 0, battlePoints: 0, conceded: 0, balance: 0, name: nameIn(names, id) });
  }
  for (const m of matches) {
    if (m.status !== "FINISHED" || !isSwissMatch(m, swissRounds)) continue;
    if (m.player1Id === m.player2Id) {
      const r = rows.get(m.player1Id);
      if (r && isSwissBye(m) && m.winnerId === m.player1Id) { r.byes++; r.swissPoints++; }
      continue;
    }
    // W.O.: a win/loss, but the match wasn't completed — points recorded
    // before the walkover stay stored, they just don't count as battle points.
    const pts = m.isWalkover ? [] : m.points ?? [];
    const p1 = pts.filter((p) => p.userId === m.player1Id).reduce((s, p) => s + p.points, 0);
    const p2 = pts.filter((p) => p.userId === m.player2Id).reduce((s, p) => s + p.points, 0);
    for (const [id, own, opp] of [[m.player1Id, p1, p2], [m.player2Id, p2, p1]] as const) {
      const r = rows.get(id);
      if (!r) continue;
      r.played++;
      r.battlePoints += own;
      r.conceded += opp;
      r.balance += own - opp;
      if (m.winnerId === id) { r.wins++; r.swissPoints++; }
      else if (m.winnerId) r.losses++;
    }
  }
  return [...rows.values()].sort(compareSwissRows);
}

export type PlacementInfo = {
  userId: string;
  place: number;
  /** "knockout" = placed by how far they went in the bracket; "swiss" = by Swiss standings. */
  basis: "knockout" | "swiss";
  /** Reached the knockout bracket. */
  qualified: boolean;
};

/**
 * Final placement of a Swiss tournament. With a knockout: everyone who played
 * in the bracket ranks above everyone who didn't; inside the bracket a later
 * elimination round is better (the champion never loses), and the third-place
 * match splits the two semifinal losers. Ties inside the bracket and everyone
 * outside it fall back to the Swiss standings.
 */
export function computeSwissFinalPlacement(userIds: string[], matches: StandingsMatch[], swissRounds: number, names?: NameLookup): PlacementInfo[] {
  const swiss = computeSwissStandings(userIds, matches, swissRounds, names);
  const swissIndex = new Map(swiss.map((r, i) => [r.userId, i]));
  const playoff = matches.filter((m) => m.round > swissRounds && m.player1Id !== m.player2Id);
  const inPlayoff = new Set<string>();
  for (const m of playoff) { inPlayoff.add(m.player1Id); inPlayoff.add(m.player2Id); }

  const elimRound = new Map<string, number>();
  for (const m of playoff) {
    if (m.status !== "FINISHED" || !m.winnerId || m.isThirdPlace) continue;
    elimRound.set(m.winnerId === m.player1Id ? m.player2Id : m.player1Id, m.round);
  }
  const third = playoff.find((m) => m.isThirdPlace && m.status === "FINISHED" && m.winnerId);

  const order = [...userIds].sort((a, b) => {
    const aQ = inPlayoff.has(a), bQ = inPlayoff.has(b);
    if (aQ !== bQ) return aQ ? -1 : 1;
    if (aQ) {
      const aE = elimRound.get(a) ?? Infinity, bE = elimRound.get(b) ?? Infinity;
      if (aE !== bE) return bE - aE;
      if (third?.winnerId === a && third.winnerId !== b) return -1;
      if (third?.winnerId === b && third.winnerId !== a) return 1;
    }
    return (swissIndex.get(a) ?? 0) - (swissIndex.get(b) ?? 0);
  });
  return order.map((userId, i) => ({ userId, place: i + 1, basis: inPlayoff.has(userId) ? "knockout" : "swiss", qualified: inPlayoff.has(userId) }));
}

/**
 * Podium that the results actually support. Returns only the positions that
 * are decided: no champion before the final is played, no 3rd place unless the
 * third-place match was played (or there was none and the bracket is over).
 */
export function decidedPodium(matches: StandingsMatch[], swissRounds: number): { first?: string; second?: string; third?: string } {
  const playoff = matches.filter((m) => m.round > swissRounds && m.player1Id !== m.player2Id && !m.isThirdPlace);
  if (playoff.length === 0) return {};
  // The final is the round where the bracket ends, computed from the size of
  // its first round — not merely "the last round that exists so far".
  const firstRound = Math.min(...playoff.map((m) => m.round));
  const firstPlayers = new Set(
    matches.filter((m) => m.round === firstRound && !m.isThirdPlace).flatMap((m) => [m.player1Id, m.player2Id])
  ).size;
  const finalRound = firstRound + Math.max(1, Math.ceil(Math.log2(Math.max(2, firstPlayers)))) - 1;
  const finals = playoff.filter((m) => m.round === finalRound);
  if (finals.length !== 1) return {};
  const final = finals[0];
  if (final.status !== "FINISHED" || !final.winnerId) return {};
  const first = final.winnerId;
  const second = first === final.player1Id ? final.player2Id : final.player1Id;
  const thirdMatch = matches.find((m) => m.isThirdPlace);
  let third: string | undefined;
  if (thirdMatch) {
    if (thirdMatch.status === "FINISHED" && thirdMatch.winnerId) third = thirdMatch.winnerId;
  }
  return { first, second, third };
}

/**
 * Podium of an event for summaries (home page). Knockout events: only what the
 * bracket decided (decidedPodium). Events without a knockout: the placements
 * stored when the event was closed, only once it is FINISHED. Never mixes the
 * Swiss table into a final placement.
 */
export function eventPodium(input: {
  format: string;
  status: string;
  swissRounds: number;
  matches: StandingsMatch[];
  placements: { userId: string; placement: number | null }[];
}): { first?: string; second?: string; third?: string } {
  const { format, status, swissRounds, matches, placements } = input;
  if (format === "SINGLE_ELIMINATION") return decidedPodium(matches, 0);
  const hasKnockout = (format === "ROUND_ROBIN" || format === "SWISS") && matches.some((m) => m.round > swissRounds && m.player1Id !== m.player2Id);
  if (hasKnockout) return decidedPodium(matches, swissRounds);
  if (status !== "FINISHED") return {};
  const at = (n: number) => placements.find((p) => p.placement === n)?.userId;
  return { first: at(1), second: at(2), third: at(3) };
}

export type PlacementDivergence = {
  userId: string;
  storedPlace: number;
  recalculatedPlace: number;
  /** "empate" = complete Swiss tie (only the tiebreak order differs);
   *  "resultado" = the recorded results now produce a different order
   *  (e.g. a score edited after the event was closed). */
  reason: "empate" | "resultado";
};

/**
 * Compares the final placement SAVED when the event was closed with the one
 * the current results and rules produce. The saved one is the historical
 * result and is never rewritten automatically; this only explains the gap.
 */
export function comparePlacements(
  stored: { userId: string; placement: number | null }[],
  recalculated: PlacementInfo[],
  swissRows: SwissRow[]
): PlacementDivergence[] {
  const recalcPlace = new Map(recalculated.map((p) => [p.userId, p.place]));
  const row = new Map(swissRows.map((r) => [r.userId, r]));
  const out: PlacementDivergence[] = [];
  for (const s of stored) {
    if (s.placement == null) continue;
    const rp = recalcPlace.get(s.userId);
    if (rp == null || rp === s.placement) continue;
    // Who sits in my stored slot now? If we are tied on every Swiss criterion,
    // only the tiebreak order differs.
    const other = stored.find((x) => x.placement === rp)?.userId;
    const a = row.get(s.userId), b = other ? row.get(other) : undefined;
    const tied = !!a && !!b && a.swissPoints === b.swissPoints && a.battlePoints === b.battlePoints && a.balance === b.balance;
    out.push({ userId: s.userId, storedPlace: s.placement, recalculatedPlace: rp, reason: tied ? "empate" : "resultado" });
  }
  return out.sort((x, y) => x.storedPlace - y.storedPlace);
}
