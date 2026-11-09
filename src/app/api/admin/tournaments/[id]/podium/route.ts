// Heavy tournament work (standings, round generation, ranking): give it room on big events.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { correctResult, diagnoseResult } from "@/lib/officialResultStore";
import { errorResponse } from "@/lib/observability";

// Official result of an event (docs/RESULTADO-OFICIAL.md), ORGANIZER only and
// within the admin's league:
//  GET            diagnosis (final, stored placements, champion shown, correction)
//  POST           { order: userIds from 1st, reason, dryRun? } official correction
//  DELETE         { reason, dryRun? } removes the correction (back to the matches)
// Always simulate first (dryRun) — the real run is one audited transaction.
async function guard(id: string) {
  const session = await getServerSession(authOptions);
  const denied = await denyOutsideCommunity(session, { tournamentId: id });
  if (denied) return { denied };
  if (!session || session.user.role !== "ORGANIZER") return { denied: NextResponse.json({ error: "Não autorizado" }, { status: 403 }) };
  return { session };
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard(id);
  if (g.denied) return g.denied;
  const d = await diagnoseResult(id);
  return d ? NextResponse.json(d) : NextResponse.json({ error: "Torneio não encontrado." }, { status: 404 });
}

async function run(req: NextRequest, id: string, remove: boolean) {
  const g = await guard(id);
  if (g.denied) return g.denied;
  try {
    const body = await req.json().catch(() => ({}));
    const r = await correctResult({ tournamentId: id, order: body?.order, reason: body?.reason, actorId: g.session!.user.id, dryRun: body?.dryRun === true, remove });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ...r, dryRun: body?.dryRun === true });
  } catch (e) {
    return errorResponse("/api/admin/tournaments/[id]/podium", e, "Erro ao corrigir o resultado. Nada foi alterado.");
  }
}
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return run(req, (await props.params).id, false);
}
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return run(req, (await props.params).id, true);
}
