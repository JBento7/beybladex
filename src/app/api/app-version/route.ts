export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// Version of the deploy that is live now (same value the pages were built
// with). The scoreboard compares it with its own to offer a reload at a safe
// moment — never automatically during a recording or a pending launch.
export function GET() {
  return NextResponse.json({ version: process.env.NEXT_PUBLIC_APP_VERSION ?? "local" }, { headers: { "Cache-Control": "no-store" } });
}
