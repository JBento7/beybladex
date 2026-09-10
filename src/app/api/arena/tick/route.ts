export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lightweight countdown poll for one arena: a single indexed query returning
// only the current countdown signal. The telão polls this fast (so the video
// starts almost immediately) while the heavy /api/arena poll stays slower.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let arenaNum: number | null = null;
  const m = /^arena(\d+)@/i.exec(session.user.email ?? "");
  if (m) arenaNum = parseInt(m[1]);
  const q = req.nextUrl.searchParams.get("n");
  if (q && session.user.role === "ORGANIZER") arenaNum = parseInt(q);
  if (!arenaNum || Number.isNaN(arenaNum)) return NextResponse.json({ countdown: null });

  const arenaWhere = arenaNum === 1 ? { OR: [{ arena: 1 }, { arena: null }] } : { arena: arenaNum };
  const WINDOW_MS = 7000;
  const since = new Date(Date.now() - WINDOW_MS);

  let countdown: { key: string; elapsedMs: number } | null = null;
  let finish: { key: string; type: string; elapsedMs: number } | null = null;
  try {
    const row = await prisma.match.findFirst({
      where: {
        ...arenaWhere,
        status: { in: ["IN_PROGRESS", "PENDING"] },
        countdownAt: { gte: since },
      },
      orderBy: { countdownAt: "desc" },
      select: { id: true, countdownAt: true },
    });
    if (row?.countdownAt) {
      const ts = new Date(row.countdownAt).getTime();
      countdown = { key: `${row.id}:${ts}`, elapsedMs: Date.now() - ts };
    }
  } catch { /* countdownAt column missing — ignore */ }

  try {
    const row = await prisma.match.findFirst({
      where: { ...arenaWhere, finishVideoAt: { gte: since } },
      orderBy: { finishVideoAt: "desc" },
      select: { id: true, finishVideoAt: true, finishVideoType: true },
    });
    if (row?.finishVideoAt && row.finishVideoType) {
      const ts = new Date(row.finishVideoAt).getTime();
      finish = { key: `${row.id}:${ts}`, type: row.finishVideoType, elapsedMs: Date.now() - ts };
    }
  } catch { /* finishVideo columns missing — ignore */ }

  return NextResponse.json({ countdown, finish });
}
