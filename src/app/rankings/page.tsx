import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import RankingsTable from "./RankingsTable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rankings" };

export default async function RankingsPage() {
  const session = await getServerSession(authOptions);

  const ranking = await prisma.tournamentParticipant.groupBy({
    by: ["userId"],
    where: { tournament: { isOfficial: true, isTest: false }, user: { isGuest: false, deleted: false } },
    _sum: { rankingPoints: true, wins: true, losses: true },
  });

  const userIds = ranking.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, email: { not: { endsWith: "@lbl.arena" } } },
    select: { id: true, name: true, bladerName: true, avatarUrl: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const list = ranking
    .map((r) => {
      const u = userMap.get(r.userId);
      if (!u) return null;
      return {
        id: u.id,
        name: u.bladerName ?? u.name,
        avatarUrl: u.avatarUrl,
        points: r._sum.rankingPoints ?? 0,
        wins: r._sum.wins ?? 0,
        losses: r._sum.losses ?? 0,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.points > 0)
    .sort((a, b) => b.points - a.points || (a.name ?? "").localeCompare(b.name ?? ""));

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white flex items-center gap-2">🏆 Rankings</h1>
          <p className="text-gray-400 mt-1">Os melhores jogadores da plataforma</p>
        </div>

        <RankingsTable list={list} currentUserId={session?.user.id ?? null} />
      </main>
    </div>
  );
}
