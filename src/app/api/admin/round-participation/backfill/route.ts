export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { swissRoundCount } from "@/lib/swiss";

// General ORGANIZER only. Fills RoundParticipation for matches created before
// the table existed.
//   GET  → simulation: what would be inserted and every historical conflict.
//   POST { confirm: true } → inserts the non-conflicting rows.
// A player with two participations in a round gets NO row for that round
// (the tool never decides which record counts) and the conflict stays listed.
async function plan() {
  const tournaments = await prisma.tournament.findMany({
    select: { id: true, name: true, format: true, swissRounds: true, matches: { select: { id: true, round: true, player1Id: true, player2Id: true, isThirdPlace: true } } },
  });
  const existing = new Set((await prisma.roundParticipation.findMany({ select: { matchId: true, userId: true } })).map((r) => `${r.matchId}:${r.userId}`));
  const rows: { tournamentId: string; phase: string; round: number; userId: string; matchId: string; kind: string }[] = [];
  const conflicts: { tournamentId: string; name: string; phase: string; round: number; userId: string; matchIds: string[] }[] = [];
  for (const t of tournaments) {
    const isSwiss = t.format === "ROUND_ROBIN" || t.format === "SWISS";
    const r1 = new Set(t.matches.filter((m) => m.round === 1).flatMap((m) => [m.player1Id, m.player2Id])).size;
    const swissRounds = isSwiss ? t.swissRounds ?? swissRoundCount(r1) : 0;
    const slot = new Map<string, { phase: string; round: number; userId: string; matchIds: string[]; kind: string }>();
    for (const m of t.matches) {
      // The third-place match shares the final's round; its players aren't in the final.
      const phase = isSwiss && m.round <= swissRounds ? "SWISS" : "KNOCKOUT";
      const ids = m.player1Id === m.player2Id ? [m.player1Id] : [m.player1Id, m.player2Id];
      for (const userId of ids) {
        const k = `${phase}:${m.round}:${userId}`;
        const cur = slot.get(k) ?? { phase, round: m.round, userId, matchIds: [], kind: m.player1Id === m.player2Id ? "BYE" : "MATCH" };
        cur.matchIds.push(m.id);
        slot.set(k, cur);
      }
    }
    for (const v of slot.values()) {
      if (v.matchIds.length > 1) { conflicts.push({ tournamentId: t.id, name: t.name, phase: v.phase, round: v.round, userId: v.userId, matchIds: v.matchIds }); continue; }
      if (existing.has(`${v.matchIds[0]}:${v.userId}`)) continue;
      rows.push({ tournamentId: t.id, phase: v.phase, round: v.round, userId: v.userId, matchId: v.matchIds[0], kind: v.kind });
    }
  }
  return { rows, conflicts };
}

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER" || session.user.adminCommunity) return null;
  return session;
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const { rows, conflicts } = await plan();
  return NextResponse.json({ simulation: true, toInsert: rows.length, conflicts });
}

export async function POST(req: Request) {
  if (!(await guard())) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { confirm?: boolean };
  if (!body.confirm) return NextResponse.json({ error: "Envie { confirm: true } depois de revisar a simulação (GET)." }, { status: 400 });
  const { rows, conflicts } = await plan();
  const res = await prisma.roundParticipation.createMany({ data: rows, skipDuplicates: true });
  return NextResponse.json({ inserted: res.count, conflictsKeptForReview: conflicts });
}
