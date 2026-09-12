export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateMakeupRound } from "@/lib/tournament-engine";

// ORGANIZER-only: check whether every participant played the same number of
// matches and, if not, generate makeup matches for the under-played players so
// nobody is disadvantaged.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  try {
    const result = await generateMakeupRound(params.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason || "Não foi possível balancear." }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[balance-matches]", err);
    return NextResponse.json({ error: `Erro ao balancear: ${String(err)}` }, { status: 500 });
  }
}
