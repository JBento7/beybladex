export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Fingerprint of the tournament list (statuses + sign-up counts) so the list
// page refreshes itself when someone registers or an event changes state.
export async function GET() {
  try {
    const rows = await prisma.$queryRaw<{ v: string | null }[]>`
      SELECT md5(coalesce(string_agg(concat_ws(',', t.id, t.status, t.name,
        (SELECT count(*) FROM "TournamentParticipant" p WHERE p."tournamentId" = t.id)), ';' ORDER BY t.id), '')) AS v
      FROM "Tournament" t`;
    return NextResponse.json({ v: rows[0]?.v ?? "" }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[tournaments version]", e);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
