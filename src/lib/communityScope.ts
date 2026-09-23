import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "./prisma";

// Admins can be scoped to one community (User.adminCommunity, e.g. "lbm").
// Unscoped (null) admins — the original LBL organizers — manage everything.
//
// Returns a 403 response when a scoped admin reaches a tournament of another
// community, or null to let the route carry on with its own checks. Partnership
// tournaments are manageable by admins of either community. For match routes,
// the judge assigned to that match is always let through, so a scoped admin can
// still referee a match they were explicitly assigned.
export async function denyOutsideCommunity(
  session: Session | null,
  ref: { tournamentId?: string; matchId?: string }
): Promise<NextResponse | null> {
  const scope = session?.user?.adminCommunity;
  if (!session || !scope) return null;

  let community: string | null = null;
  let partnership = false;
  let judgeId: string | null = null;
  try {
    if (ref.matchId) {
      const m = await prisma.match.findUnique({
        where: { id: ref.matchId },
        select: { judgeId: true, tournament: { select: { communitySlug: true, isPartnership: true } } },
      });
      if (!m) return null; // let the route answer 404
      community = m.tournament.communitySlug;
      partnership = m.tournament.isPartnership;
      judgeId = m.judgeId;
    } else if (ref.tournamentId) {
      const t = await prisma.tournament.findUnique({
        where: { id: ref.tournamentId },
        select: { communitySlug: true, isPartnership: true },
      });
      if (!t) return null;
      community = t.communitySlug;
      partnership = t.isPartnership;
    }
  } catch {
    return null; // pre-migration: columns missing — behave as before
  }

  if (community === null || community === scope || partnership || judgeId === session.user.id) return null;
  return NextResponse.json(
    { error: "Este torneio pertence a outra comunidade — seu acesso de admin é só da sua comunidade." },
    { status: 403 }
  );
}
