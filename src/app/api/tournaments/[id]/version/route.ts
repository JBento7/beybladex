export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// A cheap fingerprint of everything the tournament page shows: registrations
// (and approvals/standings), matches (status, winner, arena) and the scoring
// (points, sets, deck orders). The page polls this and only re-renders when it
// changes — so a new sign-up or a match scored by another judge shows up
// without anyone pressing refresh. One small query, no row data returned.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const rows = await prisma.$queryRaw<{ v: string | null; status: string | null }[]>`
      SELECT t.status::text AS status, md5(concat_ws('|',
        t.status,
        (SELECT md5(coalesce(string_agg(concat_ws(',', p."userId", p.approved, p."groupId", p.wins, p.losses, p."totalPoints", p.placement, p.beyblade1, p.beyblade2, p.beyblade3), ';' ORDER BY p.id), ''))
           FROM "TournamentParticipant" p WHERE p."tournamentId" = t.id),
        (SELECT md5(coalesce(string_agg(concat_ws(',', m.id, m.status, m."winnerId", m.arena, m.slot, m.round, m."xSidePlayerId", m."updatedAt"), ';' ORDER BY m.id), ''))
           FROM "Match" m WHERE m."tournamentId" = t.id),
        (SELECT count(*) FROM "MatchPoint" mp JOIN "Match" m ON m.id = mp."matchId" WHERE m."tournamentId" = t.id),
        (SELECT count(*) FROM "MatchSet" ms JOIN "Match" m ON m.id = ms."matchId" WHERE m."tournamentId" = t.id),
        (SELECT count(*) FROM "MatchSet" ms JOIN "Match" m ON m.id = ms."matchId" WHERE m."tournamentId" = t.id AND ms.status = 'FINISHED'),
        (SELECT count(*) FROM "MatchDeckOrder" d JOIN "Match" m ON m.id = d."matchId" WHERE m."tournamentId" = t.id)
      )) AS v
      FROM "Tournament" t WHERE t.id = ${params.id}`;
    if (!rows[0]) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    return NextResponse.json(rows[0], { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[tournament version]", e);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
