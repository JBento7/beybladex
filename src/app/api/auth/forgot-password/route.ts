export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail, isEmailConfigured } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "E-mail é obrigatório" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const resetToken = await prisma.passwordResetToken.create({
        data: { userId: user.id, expiresAt },
      });

      if (await isEmailConfigured()) {
        try {
          await sendPasswordResetEmail(user.email, user.name, resetToken.token);
        } catch (emailErr) {
          console.error("Failed to send password reset email:", emailErr);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
