export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { name, email, currentPassword, newPassword } = await req.json();

  // Fetch current user
  const users = await prisma.$queryRaw<{ id: string; email: string; password: string }[]>`
    SELECT id, email, password FROM "User" WHERE id = ${userId} LIMIT 1
  `;
  const user = users[0];
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const updates: Record<string, string> = {};

  if (name !== undefined) {
    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: "Nome não pode ser vazio" }, { status: 400 });
    }
    updates.name = name.trim();
  }

  if (email !== undefined) {
    if (!email || email.trim().length === 0) {
      return NextResponse.json({ error: "E-mail não pode ser vazio" }, { status: 400 });
    }
    // Check if email is taken by another user
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "User" WHERE email = ${email.trim()} AND id != ${userId} LIMIT 1
    `;
    if (existing.length > 0) {
      return NextResponse.json({ error: "E-mail já em uso" }, { status: 400 });
    }
    updates.email = email.trim();
  }

  if (newPassword !== undefined) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Senha atual é obrigatória para alterar a senha" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "A nova senha deve ter no mínimo 6 caracteres" }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 });
    }
    updates.password = await bcrypt.hash(newPassword, 10);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  await prisma.user.update({
    where: { id: userId },
    data: updates,
  });

  return NextResponse.json({ ok: true });
}
