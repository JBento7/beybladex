export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const TEST_USERS = [
  { name: "Kai Hiwatari", email: "kai@lbl.test" },
  { name: "Tyson Granger", email: "tyson@lbl.test" },
  { name: "Ray Kon", email: "ray@lbl.test" },
  { name: "Max Tate", email: "max@lbl.test" },
  { name: "Tala Ivanov", email: "tala@lbl.test" },
  { name: "Brooklyn", email: "brooklyn@lbl.test" },
  { name: "Daichi Sumeragi", email: "daichi@lbl.test" },
  { name: "Garland", email: "garland@lbl.test" },
];

const DEFAULT_PASSWORD = "Teste123456";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  try {
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const results: { name: string; email: string; status: string }[] = [];

    for (const u of TEST_USERS) {
      try {
        const existing = await prisma.user.findUnique({ where: { email: u.email } });
        if (existing) {
          results.push({ ...u, status: "já existe" });
        } else {
          await prisma.user.create({
            data: { name: u.name, email: u.email, password: hash, role: "PARTICIPANT" },
          });
          results.push({ ...u, status: "criado" });
        }
      } catch (e) {
        results.push({ ...u, status: `erro: ${String(e)}` });
      }
    }

    return NextResponse.json({
      message: `Usuários de teste prontos. Senha de todos: ${DEFAULT_PASSWORD}`,
      users: results,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
