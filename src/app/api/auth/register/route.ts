export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, inviteToken, beyblade } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são obrigatórios" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter no mínimo 6 caracteres" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "E-mail já em uso" },
        { status: 409 }
      );
    }

    let role: "PARTICIPANT" | "ORGANIZER" = "PARTICIPANT";
    let invite = null;

    if (inviteToken) {
      invite = await prisma.organizerInvite.findUnique({
        where: { token: inviteToken },
      });
      if (!invite || invite.usedBy || invite.expiresAt < new Date()) {
        return NextResponse.json(
          { error: "Convite inválido ou expirado" },
          { status: 400 }
        );
      }
      role = "ORGANIZER";
    }

    const hashed = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role,
        beyblade: beyblade || null,
      },
    });

    if (invite) {
      await prisma.organizerInvite.update({
        where: { id: invite.id },
        data: { usedBy: user.id, usedAt: new Date() },
      });
    }

    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      { status: 201 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
