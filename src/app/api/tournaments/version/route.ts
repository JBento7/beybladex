export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { tournamentsVersion } from "@/lib/publicVersion";

// Fingerprint of the tournament list (lib/publicVersion).
export async function GET(req: Request) {
  try {
    const v = await tournamentsVersion();
    const etag = `W/"list-${v}"`;
    const headers = { ETag: etag, "Cache-Control": "no-store" };
    if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json({ v }, { headers });
  } catch (e) {
    console.error("[tournaments version]", String(e).slice(0, 200));
    return NextResponse.json({ error: "Indisponível" }, { status: 503 });
  }
}
