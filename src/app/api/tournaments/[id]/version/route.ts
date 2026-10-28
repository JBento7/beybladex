export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Live-page polling. Reads ONE row (stateVersion is bumped by database
// triggers in the same transaction as every relevant change — see
// prisma/sql/state_version_triggers.sql), so it never walks the point
// history. Answers 304 when the client already has this version.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { stateVersion: true, status: true } });
    if (!t) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    const etag = `W/"${t.stateVersion}-${t.status}"`;
    const headers = { ETag: etag, "Cache-Control": "no-store" };
    if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json({ v: String(t.stateVersion), status: t.status }, { headers });
  } catch (e) {
    console.error("[tournament version]", String(e).slice(0, 200));
    return NextResponse.json({ error: "Indisponível" }, { status: 503 });
  }
}
