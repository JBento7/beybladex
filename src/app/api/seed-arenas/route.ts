export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Creates 5 "arena display" users (arena1..arena5). Each is meant to be logged
// in on a tablet placed at that arena — it only shows the live scoreboard of the
// match currently being played in that arena. Password is the same for all.
const COUNT = 5;
const DEFAULT_PASSWORD = "Arena123456";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  try {
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const results: { email: string; status: string }[] = [];

    for (let n = 1; n <= COUNT; n++) {
      const email = `arena${n}@lbl.arena`;
      const name = `Arena ${n}`;
      try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          results.push({ email, status: "já existe" });
        } else {
          await prisma.user.create({
            data: { name, email, password: hash, role: "PARTICIPANT", bladerName: name },
          });
          results.push({ email, status: "criado" });
        }
      } catch (e) {
        results.push({ email, status: `erro: ${String(e)}` });
      }
    }

    return NextResponse.json({
      message: `Usuários de arena prontos. Senha de todos: ${DEFAULT_PASSWORD}`,
      login: "Faça login com arena1@lbl.arena ... arena5@lbl.arena e abra /arena",
      users: results,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
