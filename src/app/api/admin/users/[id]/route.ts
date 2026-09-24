export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") return null;
  return session;
}

// A community-scoped admin may manage players and admins of their own
// community, never a general admin or another community's admin.
function outOfReach(actorScope: string | null | undefined, target: { role: string; adminCommunity: string | null }) {
  if (!actorScope || target.role !== "ORGANIZER") return false;
  return target.adminCommunity !== actorScope;
}

// PATCH /api/admin/users/[id] — edit user
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { name, email, password, role, canJudge, adminCommunity } = await req.json();

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  // A community-scoped admin can't touch a general admin, and anyone they
  // promote is scoped to their own community — never above it.
  const actorScope = session.user.adminCommunity ?? null;
  if (outOfReach(actorScope, user)) {
    return NextResponse.json({ error: "Você só pode alterar admins da sua própria comunidade." }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (name) data.name = name;
  if (email) {
    const conflict = await prisma.user.findFirst({
      where: { email, NOT: { id: params.id } },
    });
    if (conflict) return NextResponse.json({ error: "Email já em uso" }, { status: 409 });
    data.email = email;
  }
  if (password) data.password = await bcrypt.hash(password, 10);
  if (role) {
    data.role = role === "ORGANIZER" ? "ORGANIZER" : "PARTICIPANT";
    if (role === "ORGANIZER" && actorScope) data.adminCommunity = actorScope;
  }
  if (typeof canJudge === "boolean") data.canJudge = canJudge;
  // Only an unscoped (all-communities) admin can change someone's admin scope.
  if (adminCommunity !== undefined) {
    if (session.user.adminCommunity) {
      return NextResponse.json({ error: "Apenas o admin geral pode alterar a comunidade de um admin." }, { status: 403 });
    }
    data.adminCommunity = adminCommunity === "lbl" || adminCommunity === "lbm" ? adminCommunity : null;
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, name: true, email: true, role: true, canJudge: true, adminCommunity: true },
  });

  return NextResponse.json(updated);
}

// DELETE /api/admin/users/[id] — soft-delete (anonymize), keep match history
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  // Prevent self-deletion
  if (params.id === session.user.id) {
    return NextResponse.json({ error: "Você não pode deletar sua própria conta aqui" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  if (outOfReach(session.user.adminCommunity, user)) {
    return NextResponse.json({ error: "Você só pode remover admins da sua própria comunidade." }, { status: 403 });
  }

  // Anonymize: mark deleted, scramble name/email, clear password
  await prisma.user.update({
    where: { id: params.id },
    data: {
      deleted: true,
      name: `[Usuário Removido]`,
      email: `deleted_${params.id}@removed.invalid`,
      password: "",
    },
  });

  return NextResponse.json({ ok: true });
}
