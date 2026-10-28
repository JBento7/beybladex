export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Fingerprint of the tournament list. Every tournament's stateVersion is
// bumped by database triggers on any visible change (status, sign-ups…), so
// count + sum is enough — one aggregate over the Tournament table only.
export async function GET(req: Request) {
  try {
    const rows = await prisma.$queryRaw<{ n: bigint; s: bigint | null }[]>`SELECT count(*) AS n, sum("stateVersion") AS s FROM "Tournament"`;
    const v = `${rows[0]?.n ?? 0}.${rows[0]?.s ?? 0}`;
    const etag = `W/"list-${v}"`;
    const headers = { ETag: etag, "Cache-Control": "no-store" };
    if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json({ v }, { headers });
  } catch (e) {
    console.error("[tournaments version]", String(e).slice(0, 200));
    return NextResponse.json({ error: "Indisponível" }, { status: 503 });
  }
}
