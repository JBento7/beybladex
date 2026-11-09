// Official result of a tournament (docs/RESULTADO-OFICIAL.md) — ONE rule for
// every screen (page, home, profile, certificates, ranking). Pure (no imports):
// unit-tested.
//
// Resolution order:
//  1. an ACTIVE official correction by the organization (reason + audit);
//  2. the valid result of the FINAL, when the event has a knockout — the final
//     is identified by the bracket structure (never the semifinal nor the
//     third-place match), must be finished and its winner must be one of its
//     two players, coherent with the sets (or a W.O.);
//  3. the stored final classification, for events without a knockout.
// Never the Swiss leader, the sum of battle points or the registration order
// for an event that has a final. Conflicting records without a correction →
// no champion, and a pending issue for the organization.

export type ResultMatch = {
  id?: string;
  round: number;
  status: string;
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  isWalkover?: boolean;
  isThirdPlace?: boolean;
  /** Winner of each set (when known): coherence check of the final. */
  setWinners?: (string | null)[];
};
export type OfficialCorrection = { order: string[]; reason: string; actorId: string; at: string };
export type ResultSource = "admin" | "final" | "placement" | "none";
export type OfficialPodium = {
  first?: string; second?: string; third?: string;
  source: ResultSource;
  /** Why no champion can be stated (for the organization). */
  pending: string | null;
  finalMatchId?: string;
};

/** Bracket rounds of the knockout (after the Swiss rounds; 0 = whole event). */
function knockoutMatches(matches: ResultMatch[], swissRounds: number) {
  return matches.filter((m) => m.round > swissRounds && m.player1Id !== m.player2Id && !m.isThirdPlace);
}

/**
 * The final, by the STRUCTURE of the bracket: its last round is computed from
 * the size of its first round (8 players → 3 rounds), not "the last round
 * that exists so far" — a semifinal is never taken for the final.
 */
export function findFinal(matches: ResultMatch[], swissRounds: number): { final: ResultMatch | null; issue: string | null } {
  const ko = knockoutMatches(matches, swissRounds);
  if (ko.length === 0) return { final: null, issue: null };
  const firstRound = Math.min(...ko.map((m) => m.round));
  const firstPlayers = new Set(matches.filter((m) => m.round === firstRound && !m.isThirdPlace).flatMap((m) => [m.player1Id, m.player2Id])).size;
  const finalRound = firstRound + Math.max(1, Math.ceil(Math.log2(Math.max(2, firstPlayers)))) - 1;
  const finals = ko.filter((m) => m.round === finalRound);
  if (finals.length === 0) return { final: null, issue: "A final ainda não foi gerada." };
  if (finals.length > 1) return { final: null, issue: `Há ${finals.length} partidas na rodada da final: a chave está inconsistente.` };
  return { final: finals[0], issue: null };
}

/** Problems that make a final unusable as the champion's source. */
export function finalIssues(final: ResultMatch): string[] {
  const out: string[] = [];
  if (final.status !== "FINISHED") out.push("A final não foi concluída.");
  if (!final.winnerId) { if (final.status === "FINISHED") out.push("A final está encerrada sem vencedor."); return out; }
  if (final.winnerId !== final.player1Id && final.winnerId !== final.player2Id) out.push("O vencedor registrado não é um dos jogadores da final.");
  if (!final.isWalkover && final.setWinners && final.setWinners.length > 0) {
    const loser = final.winnerId === final.player1Id ? final.player2Id : final.player1Id;
    const w = final.setWinners.filter((x) => x === final.winnerId).length;
    const l = final.setWinners.filter((x) => x === loser).length;
    if (w <= l) out.push(`Os sets não confirmam o vencedor (${w} × ${l}).`);
  }
  return out;
}

export function hasKnockout(format: string, matches: ResultMatch[], swissRounds: number): boolean {
  if (format === "SINGLE_ELIMINATION") return knockoutMatches(matches, 0).length > 0;
  return (format === "ROUND_ROBIN" || format === "SWISS") && knockoutMatches(matches, swissRounds).length > 0;
}

/** The correction is usable: a non-empty order of distinct players of the event. */
export function activeCorrection(c: unknown, participants: string[]): OfficialCorrection | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Partial<OfficialCorrection>;
  if (!Array.isArray(o.order) || o.order.length === 0 || typeof o.reason !== "string" || !o.reason.trim()) return null;
  if (new Set(o.order).size !== o.order.length || o.order.some((u) => !participants.includes(u))) return null;
  return { order: o.order, reason: o.reason, actorId: String(o.actorId ?? ""), at: String(o.at ?? "") };
}

export function resolveOfficialPodium(input: {
  format: string;
  status: string;
  swissRounds: number;
  matches: ResultMatch[];
  placements: { userId: string; placement: number | null }[];
  correction?: unknown;
}): OfficialPodium {
  const { format, status, matches, placements } = input;
  const swissRounds = format === "SINGLE_ELIMINATION" ? 0 : input.swissRounds;
  const corr = activeCorrection(input.correction, placements.map((p) => p.userId));
  if (corr) return { first: corr.order[0], second: corr.order[1], third: corr.order[2], source: "admin", pending: null };

  if (hasKnockout(format, matches, swissRounds)) {
    const { final, issue } = findFinal(matches, swissRounds);
    if (!final) return { source: "none", pending: issue };
    const problems = finalIssues(final);
    if (problems.length) {
      // An unfinished final is simply "not decided yet"; anything else is a conflict.
      return { source: "none", pending: final.status === "FINISHED" ? `Pendência: ${problems.join(" ")}` : null, finalMatchId: final.id };
    }
    const first = final.winnerId!;
    const second = first === final.player1Id ? final.player2Id : final.player1Id;
    const third = matches.find((m) => m.isThirdPlace && m.status === "FINISHED" && m.winnerId)?.winnerId ?? undefined;
    return { first, second, third, source: "final", pending: null, finalMatchId: final.id };
  }
  if (status !== "FINISHED") return { source: "none", pending: null };
  const at = (n: number) => placements.find((p) => p.placement === n)?.userId;
  return at(1) ? { first: at(1), second: at(2), third: at(3), source: "placement", pending: null } : { source: "none", pending: null };
}

/** The ranked order with the correction's players on top, in its order;
 *  everyone else keeps their relative position. */
export function applyCorrectionOrder(ranked: string[], correction: OfficialCorrection | null): string[] {
  if (!correction) return ranked;
  const top = correction.order.filter((u) => ranked.includes(u));
  return [...top, ...ranked.filter((u) => !top.includes(u))];
}

/** Stored first place vs. the official champion (shown to the organization). */
export function placementConflict(official: OfficialPodium, stored: { userId: string; placement: number | null }[]): string | null {
  const storedFirst = stored.find((p) => p.placement === 1)?.userId;
  if (!official.first || !storedFirst || storedFirst === official.first) return null;
  return "O 1º colocado armazenado difere do campeão oficial: a classificação precisa ser recalculada.";
}
