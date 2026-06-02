import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { FINISH_TYPE_LABELS, FINISH_TYPE_POINTS } from "@/lib/scoring";
import type { FinishType } from "@prisma/client";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, beyblade: true, role: true, createdAt: true },
  });

  if (!user) redirect("/login");

  const participations = await prisma.tournamentParticipant.findMany({
    where: { userId },
    include: { tournament: true },
    orderBy: { createdAt: "desc" },
  });

  // All finish types for this user
  const allPoints = await prisma.matchPoint.findMany({
    where: { userId },
    select: { finishType: true, points: true },
  });

  // Aggregate by finish type
  const finishBreakdown: Record<string, { count: number; points: number }> = {};
  for (const p of allPoints) {
    if (!finishBreakdown[p.finishType]) {
      finishBreakdown[p.finishType] = { count: 0, points: 0 };
    }
    finishBreakdown[p.finishType].count++;
    finishBreakdown[p.finishType].points += p.points;
  }

  const totalPoints = allPoints.reduce((sum, p) => sum + p.points, 0);
  const totalWins = participations.reduce((sum, p) => sum + p.wins, 0);
  const totalLosses = participations.reduce((sum, p) => sum + p.losses, 0);
  const totalMatches = totalWins + totalLosses;
  const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;

  const finishOrder: FinishType[] = ["EXTREME_FINISH", "BURST_FINISH", "OVER_FINISH", "SPIN_FINISH"];
  const finishColors: Record<string, string> = {
    EXTREME_FINISH: "bg-amber-500",
    BURST_FINISH: "bg-purple-500",
    OVER_FINISH: "bg-blue-500",
    SPIN_FINISH: "bg-gray-500",
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-20 h-20 bg-amber-500/20 border-2 border-amber-500/50 rounded-full flex items-center justify-center text-4xl">
              🌀
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-white">{user.name}</h1>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                  user.role === "ORGANIZER"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                }`}>
                  {user.role}
                </span>
              </div>
              <p className="text-gray-400 text-sm mb-2">{user.email}</p>
              {user.beyblade && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Beyblade:</span>
                  <span className="text-sm font-semibold text-amber-400">{user.beyblade}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Pontos Totais", value: totalPoints, color: "text-amber-400", icon: "⭐" },
            { label: "Taxa de Vitória", value: `${winRate}%`, color: "text-green-400", icon: "📈" },
            { label: "Total de Vitórias", value: totalWins, color: "text-green-400", icon: "🏆" },
            { label: "Torneios", value: participations.length, color: "text-blue-400", icon: "🌀" },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className={`text-2xl font-black ${stat.color} mb-1`}>{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Finish Type Breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-5">Tipos de Finish</h2>
            {allPoints.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Nenhuma partida jogada ainda</p>
            ) : (
              <div className="space-y-4">
                {finishOrder.map((type) => {
                  const data = finishBreakdown[type];
                  if (!data) return null;
                  const pct = allPoints.length > 0 ? Math.round((data.count / allPoints.length) * 100) : 0;
                  return (
                    <div key={type}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-gray-300 font-medium">{FINISH_TYPE_LABELS[type]}</span>
                        <span className="text-gray-400">{data.count}× · +{data.points}pts</span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${finishColors[type]} rounded-full transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{pct}%</div>
                    </div>
                  );
                })}

                {/* Visual breakdown circles */}
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <div className="text-xs text-gray-500 mb-3">Referência de Pontuação</div>
                  <div className="flex flex-wrap gap-2">
                    {finishOrder.map((type) => (
                      <div key={type} className="flex items-center gap-1.5 text-xs text-gray-400">
                        <div className={`w-2.5 h-2.5 rounded-full ${finishColors[type]}`} />
                        <span>{FINISH_TYPE_LABELS[type]} ({FINISH_TYPE_POINTS[type]}pt)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tournament History */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-5">Histórico de Torneios</h2>
            {participations.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm mb-4">Nenhum torneio ainda</p>
                <Link
                  href="/tournaments"
                  className="text-amber-400 hover:text-amber-300 text-sm font-medium"
                >
                  Ver Torneios →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {participations.map((p) => (
                  <Link
                    key={p.id}
                    href={`/tournaments/${p.tournament.id}`}
                    className="block bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-amber-500/30 rounded-lg p-4 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-semibold text-white text-sm">{p.tournament.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.tournament.status === "FINISHED"
                          ? "bg-gray-700 text-gray-400"
                          : p.tournament.status === "IN_PROGRESS"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {p.tournament.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-amber-400 font-bold">{p.totalPoints} pts</span>
                      <span className="text-gray-600">·</span>
                      <span className="text-green-400">{p.wins}W</span>
                      <span className="text-red-400">{p.losses}L</span>
                      {p.placement && (
                        <>
                          <span className="text-gray-600">·</span>
                          <span className="text-amber-300">#{p.placement}º lugar</span>
                        </>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
