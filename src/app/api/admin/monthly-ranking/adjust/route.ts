export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { errorResponse } from "@/lib/observability";
import { checkTarget, MonthlyError, applyAdjustment } from "@/lib/monthlyAdmin";

// Monthly ranking admin operation (lib/monthlyAdmin): permission and league
// scope checked here, the rest validated and applied in one locked transaction.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  try {
    const body = await req.json().catch(() => ({}));
    const { league, month } = checkTarget(session, body.league, body.month);
    const r = await applyAdjustment({ league, month, requestId: body.requestId, kind: body.kind, userId: body.userId, points: body.points, reason: body.reason, actorId: session!.user.id });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof MonthlyError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse("/api/admin/monthly-ranking/adjust", e, "Não foi possível aplicar o ajuste.");
  }
}
