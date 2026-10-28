// Server-side loader for lib/matchPolicy: reads, in ONE query, everything the
// rule needs and returns either the decision context or a ready error
// response. If the permission lookup fails, access is DENIED (never widened).
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "./prisma";
import { decideMatchOp, type Actor, type MatchContext, type MatchOpOwn } from "./matchPolicy";

export function actorOf(session: Session | null): Actor | null {
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    role: session.user.role,
    canJudge: !!session.user.canJudge,
    adminCommunity: session.user.adminCommunity ?? null,
    email: session.user.email ?? null,
  };
}

export async function authorizeMatchOp(session: Session | null, matchId: string, op: MatchOpOwn):
  Promise<{ ok: true; actor: { id: string }; as: string; tournamentId: string } | { ok: false; response: NextResponse }> {
  const actor = actorOf(session);
  if (!actor) return { ok: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  let m;
  try {
    m = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        judgeId: true, player1Id: true, player2Id: true, tournamentId: true,
        tournament: {
          select: {
            organizerId: true, isOfficial: true, isTest: true, communitySlug: true, isPartnership: true, judgingMode: true,
            participants: { where: { userId: actor.id, approved: { not: false } }, select: { id: true }, take: 1 },
          },
        },
      },
    });
  } catch (e) {
    console.error("[matchAccess] permission lookup failed", { matchId, op, err: String(e).slice(0, 200) });
    return { ok: false, response: NextResponse.json({ error: "Não foi possível verificar sua permissão agora. Tente novamente." }, { status: 503 }) };
  }
  if (!m) return { ok: false, response: NextResponse.json({ error: "Partida não encontrada" }, { status: 404 }) };
  const ctx: MatchContext = {
    judgeId: m.judgeId, player1Id: m.player1Id, player2Id: m.player2Id,
    tournament: { ...m.tournament, judgingMode: m.tournament.judgingMode ?? "RESTRICTED" },
    actorIsParticipant: m.tournament.participants.length > 0,
  };
  const d = decideMatchOp(actor, ctx, op);
  if (!d.allowed) return { ok: false, response: NextResponse.json({ error: d.reason }, { status: d.status }) };
  return { ok: true, actor, as: d.as, tournamentId: m.tournamentId };
}

/** Audit trail of match operations (who, when, what, before/after). No secrets. */
export async function logMatchOp(
  db: Pick<typeof prisma, "matchAuditLog">,
  entry: { tournamentId: string; matchId: string; actorId: string; actorRole: string; op: string; before?: unknown; after?: unknown }
) {
  await db.matchAuditLog.create({
    data: {
      tournamentId: entry.tournamentId, matchId: entry.matchId, actorId: entry.actorId, actorRole: entry.actorRole, op: entry.op,
      before: entry.before === undefined ? undefined : (JSON.parse(JSON.stringify(entry.before)) as object),
      after: entry.after === undefined ? undefined : (JSON.parse(JSON.stringify(entry.after)) as object),
    },
  });
}

/** Judge/organizer/admin of this match (may act on any player's deck). */
export async function isMatchStaff(session: Session | null, matchId: string): Promise<boolean> {
  if (!session?.user) return false;
  const r = await authorizeMatchOp(session, matchId, "deckOrder");
  return r.ok;
}
