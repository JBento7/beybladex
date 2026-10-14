export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Creates judge-only accounts (juiz1..juiz5@<community>.juiz). Like the arena
// accounts, but meant for the judges' phones: they land on /juiz, which lists
// only the community's live tournaments, and can score matches (canJudge).
const COUNT = 5;
const DEFAULT_PASSWORD = "Juiz123456";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  // A community admin can only create judges for their own community.
  const cParam = new URL(req.url).searchParams.get("c") ?? "lbl";
  const community = session.user.adminCommunity ?? (/^[a-z0-9]+$/.test(cParam) ? cParam : "lbl");

  try {
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const results: { email: string; status: string }[] = [];

    for (let n = 1; n <= COUNT; n++) {
      const email = `juiz${n}@${community}.juiz`;
      const name = `Juiz ${n} ${community.toUpperCase()}`;
      try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          results.push({ email, status: "já existe" });
        } else {
          await prisma.user.create({
            data: { name, email, password: hash, role: "PARTICIPANT", bladerName: name, canJudge: true, homeCommunity: community },
          });
          results.push({ email, status: "criado" });
        }
      } catch (e) {
        results.push({ email, status: `erro: ${String(e)}` });
      }
    }

    return NextResponse.json({
      message: `Usuários de juiz prontos. Senha de todos: ${DEFAULT_PASSWORD}`,
      login: `Faça login com juiz1@${community}.juiz ... juiz5@${community}.juiz`,
      users: results,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
