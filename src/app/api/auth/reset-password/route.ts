export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json();

    if (!token || !newPassword) {
      return NextResponse.json({ error: "Token e nova senha são obrigatórios" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "A senha deve ter no mínimo 6 caracteres" }, { status: 400 });
    }

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!resetToken) {
      return NextResponse.json({ error: "Token inválido" }, { status: 400 });
    }

    if (resetToken.used) {
      return NextResponse.json({ error: "Token já utilizado" }, { status: 400 });
    }

    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json({ error: "Token expirado" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashed },
    });

    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
