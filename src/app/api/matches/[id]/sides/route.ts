export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";

// The judge assigns the stadium sides before the first round: which player is on
// the X side (the other is on the B side). POST { xSidePlayerId }.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let match;
  try {
    match = await prisma.match.findUnique({
      where: { id: params.id },
      select: {
        player1Id: true,
        player2Id: true,
        judgeId: true,
        tournament: { select: { organizerId: true, _count: { select: { judges: true } } } },
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Banco desatualizado — rode /api/migrate", detail: String(e).slice(0, 200) },
      { status: 500 }
    );
  }
  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

  // Shared server-side rule (lib/matchPolicy): no assigned judge no longer
  // means "anyone logged in"; open judging is an explicit event setting.
  const access = await authorizeMatchOp(session, params.id, "sides");
  if (!access.ok) return access.response;

  let xSidePlayerId: string | null = null;
  try {
    xSidePlayerId = String((await req.json())?.xSidePlayerId ?? "") || null;
  } catch {
    /* body optional */
  }
  if (xSidePlayerId && xSidePlayerId !== match.player1Id && xSidePlayerId !== match.player2Id) {
    return NextResponse.json({ error: "Jogador inválido" }, { status: 400 });
  }

  try {
    const before = await prisma.match.findUnique({ where: { id: params.id }, select: { xSidePlayerId: true, tournamentId: true } });
    await prisma.$transaction([
      prisma.match.update({ where: { id: params.id }, data: { xSidePlayerId } }),
      prisma.matchAuditLog.create({ data: { tournamentId: before!.tournamentId, matchId: params.id, actorId: access.actor.id, actorRole: access.as, op: "sides", before: { xSidePlayerId: before!.xSidePlayerId }, after: { xSidePlayerId } } }),
    ]);
  } catch {
    return NextResponse.json({ error: "Coluna xSidePlayerId ausente — rode /api/migrate" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, xSidePlayerId });
}
