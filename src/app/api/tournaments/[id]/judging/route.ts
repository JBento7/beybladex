export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { actorOf } from "@/lib/matchAccess";
import { adminInScope } from "@/lib/matchPolicy";

// Explicit judging setting of an event. Only BeyEncontros can open scoring to
// their approved participants; official events stay RESTRICTED. Allowed for an
// admin in scope or the BeyEncontro organizer. Every change is recorded.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const actor = actorOf(session);
  if (!actor) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const mode = body.mode === "OPEN_PARTICIPANTS" ? "OPEN_PARTICIPANTS" : "RESTRICTED";
  const t = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { organizerId: true, isOfficial: true, communitySlug: true, isPartnership: true, judgingMode: true },
  });
  if (!t) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
  const allowed = adminInScope(actor, t) || (!t.isOfficial && t.organizerId === actor.id);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  if (t.isOfficial && mode !== "RESTRICTED") {
    return NextResponse.json({ error: "Torneios oficiais usam somente arbitragem restrita (admins e juízes)." }, { status: 400 });
  }
  if (t.judgingMode === mode) return NextResponse.json({ ok: true, mode });
  await prisma.$transaction([
    prisma.tournament.update({ where: { id: params.id }, data: { judgingMode: mode, stateVersion: { increment: 1 } } }),
    prisma.tournamentAdminAction.create({
      data: { tournamentId: params.id, kind: "JUDGING_MODE", reason: "Alteração da arbitragem", actorId: actor.id, before: { judgingMode: t.judgingMode }, after: { judgingMode: mode } },
    }),
  ]);
  return NextResponse.json({ ok: true, mode });
}
