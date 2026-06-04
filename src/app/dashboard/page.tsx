import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { FINISH_TYPE_LABELS } from "@/lib/scoring";
import type { FinishType } from "@prisma/client";
import GenerateInviteButton from "./GenerateInviteButton";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  REGISTRATION: "Inscrições",
  IN_PROGRESS: "Em andamento",
  FINISHED: "Finalizado",
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const userId = session.user.id;

  // Errors here bubble up to dashboard/error.tsx (friendly boundary)
  const [participations, recentMatches, upcomingMatches, organizedTournaments, beyblades] =
    await Promise.all([
      prisma.tournamentParticipant.findMany({
        where: { userId },
        include: { tournament: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.match.findMany({
        where: {
          status: "FINISHED",
          OR: [{ player1Id: userId }, { player2Id: userId }],
        },
        include: {
          player1: { select: { id: true, name: true } },
          player2: { select: { id: true, name: true } },
          winner: { select: { id: true, name: true } },
          tournament: { select: { id: true, name: true } },
          points: { where: { userId }, select: { points: true, finishType: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.match.findMany({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          OR: [{ player1Id: userId }, { player2Id: userId }],
        },
        include: {
          player1: { select: { id: true, name: true } },
          player2: { select: { id: true, name: true } },
          tournament: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 5,
      }),
      prisma.tournament.findMany({
        where: { organizerId: userId, status: { not: "FINISHED" } },
        include: { _count: { select: { participants: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.beyblade.findMany({
        where: { userId },
        include: { matchPoints: { select: { points: true } } },
        orderBy: { wins: "desc" },
      }),
    ]);

  const totalPoints = participations.reduce((sum: number, p: { totalPoints: number }) => sum + p.totalPoints, 0);
  const totalWins = participations.reduce((sum: number, p: { wins: number }) => sum + p.wins, 0);
  const totalLosses = participations.reduce((sum: number, p: { losses: number }) => sum + p.losses, 0);
  const activeTournaments = participations.filter(
    (p: { tournament: { status: string } }) =>
      p.tournament.status === "IN_PROGRESS" || p.tournament.status === "REGISTRATION"
  ).length;

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">
            Bem-vindo, <span className="text-[#f0a500]">{session.user.name}</span>!
          </h1>
          <p className="text-gray-400 mt-1">Acompanhe suas partidas, torneios e suba no ranking.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total de Pontos", value: totalPoints, icon: "⭐", color: "text-[#f0a500]" },
            { label: "Vitórias", value: totalWins, icon: "🏆", color: "text-green-400" },
            { label: "Derrotas", value: totalLosses, icon: "💀", color: "text-red-400" },
            { label: "Torneios Ativos", value: activeTournaments, icon: "🌀", color: "text-blue-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{stat.icon}</span>
              </div>
              <div className={`text-3xl font-black ${stat.color} mb-1`}>{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Upcoming Matches */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Próximas Partidas</h2>
            {upcomingMatches.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Nenhuma partida agendada</p>
            ) : (
              <div className="space-y-3">
                {upcomingMatches.map((match: { id: string; player1Id: string; player2: { name: string }; player1: { name: string }; tournament: { id: string; name: string }; round: number; status: string }) => {
                  const opponent =
                    match.player1Id === userId ? match.player2 : match.player1;
                  return (
                    <Link
                      key={match.id}
                      href={`/tournaments/${match.tournament.id}`}
                      className="flex items-center justify-between p-3 bg-[#252525] hover:bg-[#2d2d2d] rounded-lg transition-colors"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">vs {opponent.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{match.tournament.name} · Rodada {match.round}</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        match.status === "IN_PROGRESS"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-gray-700 text-gray-400"
                      }`}>
                        {match.status === "IN_PROGRESS" ? "Em andamento" : "Pendente"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Match History */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Batalhas Recentes</h2>
            {recentMatches.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Nenhum histórico de partidas ainda</p>
            ) : (
              <div className="space-y-3">
                {recentMatches.map((match: { id: string; player1Id: string; winnerId: string | null; player2: { name: string }; player1: { name: string }; tournament: { name: string }; points: { points: number; finishType: string }[] }) => {
                  const isWinner = match.winnerId === userId;
                  const opponent =
                    match.player1Id === userId ? match.player2 : match.player1;
                  const matchPoints = match.points;
                  const pointsEarned = matchPoints.reduce((sum: number, p: { points: number }) => sum + p.points, 0);
                  const finishTypes = matchPoints.map((p: { finishType: string }) => FINISH_TYPE_LABELS[p.finishType as FinishType]);

                  return (
                    <div
                      key={match.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isWinner
                          ? "bg-green-900/20 border-green-700/30"
                          : "bg-red-900/20 border-red-700/30"
                      }`}
                    >
                      <div>
                        <div className="text-sm font-medium text-white">
                          {isWinner ? "🏆 " : "💀 "}vs {opponent.name}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {match.tournament.name}
                          {finishTypes.length > 0 && ` · ${finishTypes.join(", ")}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${isWinner ? "text-[#f0a500]" : "text-gray-500"}`}>
                          +{pointsEarned} pts
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Organizer Panel */}
        {organizedTournaments.length > 0 && (
          <div className="mt-6 bg-[#1a1a1a] border border-[#f0a500]/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-lg font-bold text-white">Seus Torneios Ativos</h2>
              <div className="flex items-center gap-3">
                {session.user.role === "ORGANIZER" && <GenerateInviteButton />}
                <Link
                  href="/tournaments/create"
                  className="bg-[#c8102e] hover:bg-[#a00d24] text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  + Novo Torneio
                </Link>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizedTournaments.map((t: { id: string; name: string; status: string; _count: { participants: number } }) => (
                <Link
                  key={t.id}
                  href={`/tournaments/${t.id}`}
                  className="bg-[#252525] hover:bg-[#2d2d2d] border border-[#333] rounded-lg p-4 transition-colors"
                >
                  <div className="font-semibold text-white mb-1">{t.name}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{t._count.participants} participantes</span>
                    <span>·</span>
                    <span className={`font-medium ${
                      t.status === "IN_PROGRESS" ? "text-green-400" : "text-[#f0a500]"
                    }`}>{STATUS_LABELS[t.status] || t.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Create Tournament CTA if no organized tournaments */}
        {organizedTournaments.length === 0 && (
          <div className="mt-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Organizar um Torneio</h2>
              <p className="text-gray-500 text-sm mt-1">Crie e gerencie seu próprio campeonato de Beyblade.</p>
            </div>
            <div className="flex items-center gap-3">
              {session.user.role === "ORGANIZER" && <GenerateInviteButton />}
              <Link
                href="/tournaments/create"
                className="bg-[#c8102e] hover:bg-[#a00d24] text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
              >
                + Novo Torneio
              </Link>
            </div>
          </div>
        )}

        {/* Beyblade Performance */}
        {beyblades.length > 0 && (
          <div className="mt-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-bold text-white">Desempenho dos Combos</h2>
              <Link href="/profile" className="text-xs text-[#f0a500] hover:underline">
                Gerenciar combos →
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {beyblades.map((b: { id: string; name: string; blade: string | null; ratchet: string | null; bit: string | null; wins: number; losses: number; matchPoints: { points: number }[] }) => {
                const total = b.wins + b.losses;
                const winRate = total > 0 ? Math.round((b.wins / total) * 100) : 0;
                const points = b.matchPoints.reduce((s: number, mp: { points: number }) => s + mp.points, 0);
                const parts = [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");
                return (
                  <div key={b.id} className="bg-[#252525] border border-[#333] rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">🌀 {b.name}</div>
                        {parts && <div className="text-xs text-gray-500 mt-0.5 truncate">{parts}</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-black text-[#f0a500] leading-none">{points}</div>
                        <div className="text-[10px] text-gray-500">pontos</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-base font-black text-green-400">{b.wins}</div>
                        <div className="text-[10px] text-gray-500">Vitórias</div>
                      </div>
                      <div>
                        <div className="text-base font-black text-red-400">{b.losses}</div>
                        <div className="text-[10px] text-gray-500">Derrotas</div>
                      </div>
                      <div>
                        <div className="text-base font-black text-blue-400">{winRate}%</div>
                        <div className="text-[10px] text-gray-500">Taxa V.</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* My Tournaments */}
        {participations.length > 0 && (
          <div className="mt-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Meus Torneios</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {participations.map((p: { id: string; totalPoints: number; wins: number; losses: number; tournament: { id: string; name: string; status: string } }) => (
                <Link
                  key={p.id}
                  href={`/tournaments/${p.tournament.id}`}
                  className="bg-[#252525] border border-[#333] hover:border-amber-500/40 rounded-lg p-4 transition-colors"
                >
                  <div className="font-semibold text-white mb-2">{p.tournament.name}</div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-[#f0a500] font-bold">{p.totalPoints} pts</span>
                    <span className="text-gray-500">·</span>
                    <span className="text-green-400">{p.wins}V</span>
                    <span className="text-red-400">{p.losses}D</span>
                  </div>
                  <div className={`mt-2 text-xs font-medium ${
                    p.tournament.status === "IN_PROGRESS" ? "text-green-400" : "text-gray-500"
                  }`}>
                    {STATUS_LABELS[p.tournament.status] || p.tournament.status}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
