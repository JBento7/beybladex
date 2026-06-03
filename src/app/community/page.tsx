export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";

export default async function CommunityPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const players = await prisma.user.findMany({
    where: { deleted: false },
    select: {
      id: true,
      name: true,
      role: true,
      avatarUrl: true,
      beyblades: {
        select: { id: true, name: true, wins: true, losses: true },
      },
      participations: {
        select: { wins: true, losses: true, totalPoints: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const playersWithStats = players.map((p) => {
    const wins = p.participations.reduce((s, x) => s + x.wins, 0);
    const losses = p.participations.reduce((s, x) => s + x.losses, 0);
    const points = p.participations.reduce((s, x) => s + x.totalPoints, 0);
    const matches = wins + losses;
    const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
    return { ...p, wins, losses, points, matches, winRate };
  });

  // sort by wins desc
  playersWithStats.sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));

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
                      <div className="w-full h-full bg-[#f0a500]/20 flex items-center justify-center text-2xl">
                        🌀
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white truncate group-hover:text-[#f0a500] transition-colors">
                        {player.name}
                      </span>
                      {player.role === "ORGANIZER" && (
                        <span className="text-xs bg-[#f0a500]/20 text-[#f0a500] border border-[#f0a500]/30 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {player.beyblades.length} beyblade{player.beyblades.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-5">
                  <div className="bg-[#252525] rounded-lg p-3 text-center">
                    <div className="text-lg font-black text-green-400">{player.wins}</div>
                    <div className="text-xs text-gray-500">Vitórias</div>
                  </div>
                  <div className="bg-[#252525] rounded-lg p-3 text-center">
                    <div className="text-lg font-black text-[#f0a500]">{player.winRate}%</div>
                    <div className="text-xs text-gray-500">Win Rate</div>
                  </div>
                  <div className="bg-[#252525] rounded-lg p-3 text-center">
                    <div className="text-lg font-black text-blue-400">{player.points}</div>
                    <div className="text-xs text-gray-500">Pontos</div>
                  </div>
                </div>

                {/* Beyblades preview */}
                {player.beyblades.length > 0 ? (
                  <div className="space-y-1.5">
                    {player.beyblades.slice(0, 3).map((bey) => {
                      const t = bey.wins + bey.losses;
                      const wr = t > 0 ? Math.round((bey.wins / t) * 100) : 0;
                      return (
                        <div key={bey.id} className="flex items-center justify-between text-xs bg-[#252525] rounded-lg px-3 py-2">
                          <span className="text-gray-300 truncate mr-2">🌀 {bey.name}</span>
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
