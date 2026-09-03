export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { TierBadge } from "@/components/TierBadge";

export const metadata: Metadata = { title: "Comunidade" };
import Link from "next/link";

export default async function CommunityPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Beyblades are hidden once an official tournament is in progress, or
  // once registration is open and the tournament starts within 7 days.
  // They become visible again once the tournament finishes.
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const activeOfficialTournament = await prisma.tournament.findFirst({
    where: {
      isOfficial: true,
      OR: [
        { status: "IN_PROGRESS" },
        { status: "REGISTRATION", startDate: { lte: sevenDaysFromNow } },
      ],
    },
    select: { id: true },
  });
  const beybladesHidden = !!activeOfficialTournament;

  const players = await prisma.user.findMany({
    // Arena display accounts (arenaN@lbl.arena) are only scoreboards — hide them.
    where: { deleted: false, isGuest: false, email: { not: { endsWith: "@lbl.arena" } } },
    select: {
      id: true,
      name: true,
      bladerName: true,
      role: true,
      avatarUrl: true,
      beyblades: {
        where: { hiddenFromCommunity: false },
        select: { id: true, name: true, wins: true, losses: true },
      },
      participations: {
        where: { tournament: { isTest: false } },
        select: { wins: true, losses: true, totalPoints: true, rankingPoints: true, tournament: { select: { isOfficial: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  // Real battle points scored in official tournaments (the classification "pts"
  // metric). For ROUND_ROBIN, participation.totalPoints holds wins — not battle
  // points — so we sum MatchPoint.points directly instead. Byes have no points.
  const battlePointAgg = await prisma.matchPoint.groupBy({
    by: ["userId"],
    where: { match: { tournament: { isOfficial: true, isTest: false } } },
    _sum: { points: true },
  });
  const officialBattleByUser = new Map<string, number>(
    battlePointAgg.map((b) => [b.userId, b._sum.points ?? 0])
  );

  const playersWithStats = players.map((p) => {
    const official = p.participations.filter((x) => x.tournament.isOfficial);
    const wins = p.participations.reduce((s, x) => s + x.wins, 0);
    const losses = p.participations.reduce((s, x) => s + x.losses, 0);
    const officialPoints = official.reduce((s, x) => s + x.rankingPoints, 0);
    const beyPoints = p.participations
      .filter((x) => !x.tournament.isOfficial)
      .reduce((s, x) => s + x.rankingPoints, 0);
    const battlePoints = p.participations.reduce((s, x) => s + x.totalPoints, 0);
    // Official-only ranking keys, matching the dashboard and the tournament
    // classification: official wins → official battle points scored.
    const officialWins = official.reduce((s, x) => s + x.wins, 0);
    const officialBattlePoints = officialBattleByUser.get(p.id) ?? 0;
    const matches = wins + losses;
    const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
    return { ...p, wins, losses, officialPoints, beyPoints, battlePoints, officialWins, officialBattlePoints, matches, winRate };
  });

  // Same order as the tournament classification and the dashboard ranking:
  // official wins → official battle points scored. (Placement/league points are
  // a separate metric shown on the card, not the ranking driver.)
  playersWithStats.sort((a, b) =>
    b.officialWins - a.officialWins ||
    b.officialBattlePoints - a.officialBattlePoints ||
    a.name.localeCompare(b.name)
  );

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">
            Comunidade <span className="text-[#f0a500]">LBL</span>
          </h1>
          <p className="text-gray-400 mt-1">Conheça os jogadores e suas Beyblades.</p>
        </div>

        {beybladesHidden && (
          <div className="mb-6 text-sm bg-[#f0a500]/10 border border-[#f0a500]/30 text-[#f0a500] px-4 py-3 rounded-lg font-medium">
            🔒 Há um torneio oficial em curso (inscrições ou em andamento). As beyblades dos jogadores ficam ocultas até o término do torneio.
          </div>
        )}

        {playersWithStats.length === 0 ? (
          <p className="text-gray-500 text-center py-16">Nenhum jogador cadastrado ainda.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {playersWithStats.map((player) => (
              <Link
                key={player.id}
                href={`/community/${player.id}`}
                className="bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#f0a500]/40 rounded-2xl p-6 transition-all hover:shadow-lg hover:shadow-[#f0a500]/5 group"
              >
                {/* Header */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#f0a500]/30 flex-shrink-0">
                    {player.avatarUrl ? (
                      <img src={player.avatarUrl} alt={player.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#f0a500]/20 flex items-center justify-center">
                        <img src="/bey-removebg-preview.png" alt="" className="w-5 h-5 object-contain" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white truncate group-hover:text-[#f0a500] transition-colors">
                        {player.bladerName || player.name}
                      </span>
                      <TierBadge wins={player.officialWins} />
                      {player.role === "ORGANIZER" && (
                        <span className="text-xs bg-[#f0a500]/20 text-[#f0a500] border border-[#f0a500]/30 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {beybladesHidden
                        ? "Beyblades ocultas"
                        : `${player.beyblades.length} beyblade${player.beyblades.length !== 1 ? "s" : ""}`}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="bg-[#252525] rounded-lg p-3 text-center">
                    <div className="text-lg font-black text-green-400">{player.wins}</div>
                    <div className="text-xs text-gray-500">Vitórias</div>
                  </div>
                  <div className="bg-[#252525] rounded-lg p-3 text-center">
                    <div className="text-lg font-black text-[#f0a500]">{player.winRate}%</div>
                    <div className="text-xs text-gray-500">Taxa V.</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  <div className="bg-[#252525] rounded-lg p-3 text-center">
                    <div className="text-lg font-black text-blue-400">{player.officialPoints}</div>
                    <div className="text-xs text-gray-500">Pontos Liga</div>
                  </div>
                  <div className="bg-[#252525] rounded-lg p-3 text-center">
                    <div className="text-lg font-black text-purple-400">{player.beyPoints}</div>
                    <div className="text-xs text-gray-500">Pts BeyEncontro</div>
                  </div>
                </div>

                {/* Beyblades preview */}
                {beybladesHidden ? (
                  <div className="text-xs text-gray-600 text-center py-2">🔒 Ocultas durante o torneio oficial</div>
                ) : player.beyblades.length > 0 ? (
                  <div className="space-y-1.5">
                    {player.beyblades.slice(0, 3).map((bey) => {
                      const t = bey.wins + bey.losses;
                      const wr = t > 0 ? Math.round((bey.wins / t) * 100) : 0;
                      return (
                        <div key={bey.id} className="flex items-center justify-between text-xs bg-[#252525] rounded-lg px-3 py-2">
                          <span className="text-gray-300 truncate mr-2 flex items-center gap-1"><img src="/bey-removebg-preview.png" alt="" className="w-4 h-4 object-contain inline-block mr-1" />{bey.name}</span>
                          <span className="text-[#f0a500] font-semibold flex-shrink-0">{wr}% WR</span>
                        </div>
                      );
                    })}
                    {player.beyblades.length > 3 && (
                      <div className="text-xs text-gray-500 text-center pt-1">
                        +{player.beyblades.length - 3} mais
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-600 text-center py-2">Nenhuma beyblade cadastrada</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
