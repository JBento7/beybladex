export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ avatarUrl: null });

  try {
    const rows = await prisma.$queryRaw<{ avatarUrl: string | null }[]>`
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='User' AND column_name='avatarUrl'
      ) THEN "avatarUrl" ELSE NULL END AS "avatarUrl"
      FROM "User" WHERE id = ${session.user.id} LIMIT 1
    `;
    return NextResponse.json({ avatarUrl: rows[0]?.avatarUrl ?? null });
  } catch {
    return NextResponse.json({ avatarUrl: null });
  }
}
