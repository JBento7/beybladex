export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadMatchState } from "@/lib/matchState";

// Official state of a match (judge panel, players' deck order screens).
// Same payload as the point/undo responses (lib/matchState).
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    const state = await loadMatchState(params.id, session);
    if (!state) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
    return NextResponse.json(state);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
