export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { logEvent } from "@/lib/observability";

// Receives client metrics (Web Vitals, arena fallback counters) and writes
// one structured log line. Only whitelisted numeric fields are kept — no
// cookies, tokens, names or free text.
const NUM_FIELDS = ["value", "delta", "arena", "p2pMessages", "tickPolls", "fullPolls", "signalsViaServer", "windowMs"] as const;
const NAMES = new Set(["CLS", "FCP", "INP", "LCP", "TTFB", "FID"]);

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(await req.text()); } catch { return new NextResponse(null, { status: 204 }); }
  const kind = body.kind === "arena" ? "arena" : body.kind === "web-vital" ? "web-vital" : null;
  if (!kind) return new NextResponse(null, { status: 204 });
  const out: Record<string, unknown> = { kind };
  for (const f of NUM_FIELDS) if (typeof body[f] === "number" && Number.isFinite(body[f] as number)) out[f] = body[f];
  if (kind === "web-vital" && typeof body.name === "string" && NAMES.has(body.name)) out.name = body.name;
  if (typeof body.path === "string") out.path = body.path.replace(/[?#].*$/, "").replace(/\/c[a-z0-9]{20,}/g, "/:id").slice(0, 80);
  logEvent("client_metric", out);
  return new NextResponse(null, { status: 204 });
}
