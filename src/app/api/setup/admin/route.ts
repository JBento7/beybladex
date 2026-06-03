export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// One-time endpoint to create the first admin account.
// Only works if no ORGANIZER exists yet in the database.
export async function POST(req: NextRequest) {
  try {
    const existing = await prisma.user.findFirst({ where: { role: "ORGANIZER" } });
    if (existing) {
      return NextResponse.json({ error: "Administrador já existe" }, { status: 400 });
    }

    const { name, email, password } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: "name, email e password são obrigatórios" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role: "ORGANIZER" },
    });

    return NextResponse.json({ success: true, id: user.id, email: user.email });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
