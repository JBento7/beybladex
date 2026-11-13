export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/observability";
import { battlePosition } from "@/lib/displayMode";
import { sidesEditable, xSideForBInSet } from "@/lib/matchSides";

// "Lados dos jogadores" (docs/JUIZ-TELAO.md §5): the physical organization of
// the match, in BOTH judging modes — choosing sides never broadcasts anything
// (no telão gate here; the endpoints that do reach the telão keep theirs).
//
// POST { bSidePlayerId, setNumber }  → that player is on the B side in the set
//   the judge is looking at (the other on the X side); stored as the existing
//   `xSidePlayerId` (X side in set 1), so the swap between sets is unchanged.
// POST { bSidePlayerId: null }       → clear (only before the first battle).
// Legacy body { xSidePlayerId } (set-1 semantics) is still accepted.
// Rules (lib/matchSides.sidesEditable): free before the first battle; once for
// an older match under way without sides (from the current set on, points and
// winners untouched); never on a finished match. Row lock + audit.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const exists = await prisma.match.findUnique({ where: { id: params.id }, select: { id: true } }).catch(() => null);
  if (!exists) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  // Same permission as scoring (lib/matchPolicy), league scope above.
  const access = await authorizeMatchOp(session, params.id, "sides");
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as { bSidePlayerId?: unknown; setNumber?: unknown; xSidePlayerId?: unknown };

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${params.id} FOR UPDATE`;
      const m = await tx.match.findUnique({
        where: { id: params.id },
        select: {
          tournamentId: true, status: true, player1Id: true, player2Id: true, xSidePlayerId: true, setsToWin: true,
          tournament: { select: { setsToWin: true } },
          sets: { select: { setNumber: true, status: true, _count: { select: { points: true } } } },
        },
      });
      if (!m) return { status: 404, body: { error: "Partida não encontrada" } };
      if (m.player1Id === m.player2Id) return { status: 400, body: { error: "Bye não tem lados." } };
      const battlesPlayed = m.sets.reduce((n, s) => n + s._count.points, 0);
      const editable = sidesEditable({ status: m.status, battlesPlayed, xSidePlayerId: m.xSidePlayerId });
      if (!editable.ok) return { status: 409, body: { error: editable.reason, code: "SIDES_LOCKED" } };
      const pos = battlePosition(m.sets.map((s) => ({ setNumber: s.setNumber, status: s.status, points: s._count.points })));
      const maxSets = (m.setsToWin ?? m.tournament.setsToWin) * 2 - 1;

      let xSidePlayerId: string | null;
      if (body.bSidePlayerId === null || body.bSidePlayerId === "" || (body.bSidePlayerId === undefined && (body.xSidePlayerId === "" || body.xSidePlayerId === null))) {
        if (battlesPlayed > 0) return { status: 409, body: { error: "Com a partida em andamento, os lados não podem ser apagados.", code: "SIDES_LOCKED" } };
        xSidePlayerId = null;
      } else if (typeof body.bSidePlayerId === "string") {
        if (body.bSidePlayerId !== m.player1Id && body.bSidePlayerId !== m.player2Id) return { status: 400, body: { error: "Jogador inválido: ele não está nesta partida." } };
        // The set the judge was looking at must still be the current one.
        if (body.setNumber !== undefined && body.setNumber !== pos.setNumber) {
          return { status: 409, body: { error: `A partida mudou (agora no set ${pos.setNumber}). Confira os lados e escolha de novo.`, code: "SET_CHANGED" } };
        }
        xSidePlayerId = xSideForBInSet({ player1Id: m.player1Id, player2Id: m.player2Id, maxSets }, body.bSidePlayerId, pos.setNumber);
      } else if (typeof body.xSidePlayerId === "string") {
        if (battlesPlayed > 0) return { status: 409, body: { error: "Atualize o placar para definir os lados.", code: "SIDES_LOCKED" } };
        if (body.xSidePlayerId !== m.player1Id && body.xSidePlayerId !== m.player2Id) return { status: 400, body: { error: "Jogador inválido: ele não está nesta partida." } };
        xSidePlayerId = body.xSidePlayerId;
      } else {
        return { status: 400, body: { error: "Escolha quem começa no B Side." } };
      }

      if (xSidePlayerId !== m.xSidePlayerId) {
        await tx.match.update({ where: { id: params.id }, data: { xSidePlayerId, scoreVersion: { increment: 1 } } });
        await tx.matchAuditLog.create({
          data: {
            tournamentId: m.tournamentId, matchId: params.id, actorId: access.actor.id, actorRole: access.as, op: "sides",
            before: { xSidePlayerId: m.xSidePlayerId },
            after: { xSidePlayerId, fromSet: pos.setNumber, battlesPlayed },
          },
        });
      }
      return { status: 200, body: { ok: true, xSidePlayerId, fromSet: pos.setNumber } };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    return errorResponse("/api/matches/[id]/sides", e, "Não foi possível salvar os lados. Tente novamente.");
  }
}
