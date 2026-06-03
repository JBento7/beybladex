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

// PATCH /api/admin/users/[id] — edit user
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { name, email, password, role } = await req.json();

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

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
  if (role) data.role = role === "ORGANIZER" ? "ORGANIZER" : "PARTICIPANT";

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, name: true, email: true, role: true },
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
