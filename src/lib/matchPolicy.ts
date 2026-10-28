// Who may operate a match (score, W.O., undo, countdown, sides, deck order…).
// Pure function — no imports — so the same rule runs on the server (every
// match API) and in the page (to decide which buttons to show), and is unit
// tested directly. Hiding a button is never the protection: the API decides.
//
// Roles, strongest first:
//  - admin          ORGANIZER in scope (unscoped, same community, or a partnership)
//  - organizer      creator of a BeyEncontro (official events are run by admins)
//  - judge          account-wide judge permission (User.canJudge); judge
//                   KIOSK accounts (juizN@<liga>.juiz) only for their league,
//                   partnerships, BeyEncontros and test events
//  - assignedJudge  the judge assigned to this match
//  - openParticipant approved participant, ONLY when the event explicitly
//                   enables open judging (never official events)
//  - player         one of the two players — only for their OWN deck order
// No judge assigned no longer means "anyone logged in may score".

export type MatchOp =
  | "score" | "walkover" | "undo" | "countdown" | "ready" | "launch" | "onair" | "sides"
  | "deckOrder"; // for someone else's deck order (own order is "deckOrderOwn")
export type MatchOpOwn = MatchOp | "deckOrderOwn";

export type Actor = {
  id: string;
  role: string; // "ORGANIZER" | "PARTICIPANT"
  canJudge: boolean;
  adminCommunity: string | null;
  email?: string | null;
};

export type MatchContext = {
  judgeId: string | null;
  player1Id: string;
  player2Id: string;
  tournament: {
    organizerId: string;
    isOfficial: boolean;
    isTest: boolean;
    communitySlug: string;
    isPartnership: boolean;
    /** "RESTRICTED" (default) | "OPEN_PARTICIPANTS" */
    judgingMode: string;
  };
  /** Actor is an APPROVED participant of this event (needed only for open judging). */
  actorIsParticipant?: boolean;
};

export type Decision = { allowed: true; as: string } | { allowed: false; status: 401 | 403; reason: string };

const JUDGE_KIOSK = /^juiz\d+@([a-z0-9]+)\.juiz$/i;

/** Open judging is an explicit setting and never applies to official events. */
export function effectiveJudgingMode(t: { isOfficial: boolean; judgingMode: string }): "RESTRICTED" | "OPEN_PARTICIPANTS" {
  return !t.isOfficial && t.judgingMode === "OPEN_PARTICIPANTS" ? "OPEN_PARTICIPANTS" : "RESTRICTED";
}

export function adminInScope(actor: Actor, t: { communitySlug: string; isPartnership: boolean }): boolean {
  if (actor.role !== "ORGANIZER") return false;
  return !actor.adminCommunity || actor.adminCommunity === t.communitySlug || t.isPartnership;
}

export function decideMatchOp(actor: Actor | null, ctx: MatchContext, op: MatchOpOwn): Decision {
  if (!actor) return { allowed: false, status: 401, reason: "Entre na sua conta para continuar." };
  const t = ctx.tournament;
  const isPlayer = actor.id === ctx.player1Id || actor.id === ctx.player2Id;

  if (op === "deckOrderOwn" && isPlayer) return { allowed: true, as: "player" };

  if (adminInScope(actor, t)) return { allowed: true, as: "admin" };
  if (actor.role === "ORGANIZER" && actor.adminCommunity) {
    // A scoped admin of ANOTHER community keeps only what any user would have
    // (e.g. being the assigned judge); fall through to those checks.
  }
  if (!t.isOfficial && actor.id === t.organizerId) return { allowed: true, as: "organizer" };
  if (ctx.judgeId && ctx.judgeId === actor.id) return { allowed: true, as: "assignedJudge" };
  if (actor.canJudge) {
    const kiosk = JUDGE_KIOSK.exec(actor.email ?? "");
    if (!kiosk) return { allowed: true, as: "judge" };
    const league = kiosk[1].toLowerCase();
    if (t.communitySlug === league || t.isPartnership || t.isTest || !t.isOfficial) return { allowed: true, as: "judge" };
  }
  if (effectiveJudgingMode(t) === "OPEN_PARTICIPANTS" && ctx.actorIsParticipant && op !== "deckOrder") {
    return { allowed: true, as: "openParticipant" };
  }
  return { allowed: false, status: 403, reason: "Você não tem permissão para operar esta partida." };
}
