export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Header profile (avatar + display name). The client caches it per visit
// (lib/client/profileCache), so this is not hit on every navigation.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ avatarUrl: null, name: null }, { headers: { "Cache-Control": "private, no-store" } });
  try {
    const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { avatarUrl: true, name: true } });
    return NextResponse.json({ avatarUrl: u?.avatarUrl ?? null, name: u?.name ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ avatarUrl: null, name: null }, { status: 503 });
  }
}
