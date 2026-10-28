// Heavy tournament work (standings, round generation, ranking): give it room on big events.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { recalculateStandings } from "@/lib/tournament-engine";

// ORGANIZER-only: duplicate matches (same round + same unordered pair).
// Default = simulation (no writes). With { apply: true, reason } it removes
// ONLY copies that were never played (PENDING, no sets/points) while another
// copy of the same pairing exists. Groups where two copies have results are
// reported for an organizer decision — the tool never picks which result counts.
// A copy of every removed row is stored in TournamentAdminAction.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { apply?: boolean; reason?: string };

  try {
    const matches = await prisma.match.findMany({
      where: { tournamentId: params.id },
      select: {
        id: true, round: true, player1Id: true, player2Id: true, status: true, winnerId: true, createdAt: true,
        _count: { select: { sets: true, points: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const groups = new Map<string, typeof matches>();
    for (const m of matches) {
      const key = `${m.round}::${[m.player1Id, m.player2Id].sort().join("|")}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }
    const unplayed = (m: (typeof matches)[number]) => m.status === "PENDING" && m._count.sets === 0 && m._count.points === 0;

    const removable: string[] = [];
    const needsDecision: { round: number; matchIds: string[] }[] = [];
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const played = group.filter((m) => !unplayed(m));
      if (played.length > 1) { needsDecision.push({ round: group[0].round, matchIds: group.map((m) => m.id) }); continue; }
      // Keep the played copy (or the oldest if none was played); drop unplayed extras.
      const keep = played[0] ?? group[0];
      for (const m of group) if (m.id !== keep.id && unplayed(m)) removable.push(m.id);
    }

    if (!body.apply) {
      return NextResponse.json({ simulation: true, removable, needsDecision });
    }
    if (!body.reason?.trim()) return NextResponse.json({ error: "Informe o motivo." }, { status: 400 });
    if (removable.length === 0) return NextResponse.json({ ok: true, removed: 0, needsDecision });

    const backup = await prisma.match.findMany({ where: { id: { in: removable } } });
    await prisma.$transaction(async (tx) => {
      await tx.tournamentAdminAction.create({
        data: {
          tournamentId: params.id, kind: "DEDUPE_UNPLAYED", reason: body.reason!.slice(0, 500), actorId: session.user.id,
          before: JSON.parse(JSON.stringify(backup)), after: { removed: removable },
        },
      });
      try { await tx.matchDeckOrder.deleteMany({ where: { matchId: { in: removable } } }); } catch { /* pre-migration */ }
      await tx.match.deleteMany({ where: { id: { in: removable }, status: "PENDING" } });
    }, { maxWait: 15000, timeout: 30000 });

    const affected = new Set(backup.flatMap((m) => [m.player1Id, m.player2Id]));
    for (const uid of affected) await recalculateStandings(params.id, uid);
    return NextResponse.json({ ok: true, removed: removable.length, needsDecision });
  } catch (err) {
    console.error("[dedupe-matches]", err);
    return NextResponse.json({ error: `Erro ao remover duplicadas: ${String(err)}` }, { status: 500 });
  }
}
