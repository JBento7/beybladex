export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { actorOf } from "@/lib/matchAccess";
import { changeDisplayMode } from "@/lib/displayModeStore";

// Choose or correct how an event's matches are followed (docs/MODO-ARBITRAGEM.md):
// organizer or admin in scope, until battles begin (lib/displayModeStore).
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
  const r = await changeDisplayMode(params.id, body.mode, actorOf(session));
  return NextResponse.json(r.body, { status: r.status });
}
