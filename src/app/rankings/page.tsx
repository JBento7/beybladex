import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import RankingsTable from "./RankingsTable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rankings" };

// Three rankings over the same data, differing only in which tournaments count:
// each community's own events, or the LBL+LBM partnership events.
const SCOPES = {
  lbl: { label: "LBL · Londrina", logo: "/lbl-logo.png", where: { communitySlug: "lbl", isPartnership: false } },
  lbm: { label: "LBM · Maringá", logo: "/lbm-logo.webp", where: { communitySlug: "lbm", isPartnership: false } },
  parceria: { label: "🤝 LBL + LBM", logo: null, where: { isPartnership: true } },
} as const;
type ScopeKey = keyof typeof SCOPES;

export default async function RankingsPage({ searchParams }: { searchParams: { r?: string } }) {
  const session = await getServerSession(authOptions);
  const scope: ScopeKey = searchParams.r && searchParams.r in SCOPES ? (searchParams.r as ScopeKey) : "lbl";

  const ranking = await prisma.tournamentParticipant.groupBy({
    by: ["userId"],
    where: { tournament: { isOfficial: true, isTest: false, ...SCOPES[scope].where }, user: { isGuest: false, deleted: false } },
    _sum: { rankingPoints: true, wins: true, losses: true },
  });

  const userIds = ranking.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, email: { not: { endsWith: ".arena" } } },
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
          <div className="flex flex-wrap gap-2 mt-4">
            {(Object.keys(SCOPES) as ScopeKey[]).map((k) => (
              <a
                key={k}
                href={`/rankings?r=${k}`}
                className={`text-sm font-bold px-4 py-2 rounded-lg border transition-colors ${
                  k === scope ? "bg-[#f0a500] text-black border-[#f0a500]" : "border-[#333] text-gray-300 hover:border-gray-500"
                }`}
              >
                {SCOPES[k].logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={SCOPES[k].logo!} alt="" className="inline-block w-5 h-5 rounded-full object-cover mr-1.5 align-[-4px]" />
                )}
                {SCOPES[k].label}
              </a>
            ))}
          </div>
          {scope === "parceria" && (
            <p className="text-xs text-gray-500 mt-2">Somente torneios em parceria entre LBL e LBM.</p>
          )}
        </div>

        <RankingsTable list={list} currentUserId={session?.user.id ?? null} />
      </main>
    </div>
  );
}
