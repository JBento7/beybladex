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

  const participations = await prisma.tournamentParticipant.findMany({
    where: { userId },
    include: {
      tournament: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const recentMatches = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    include: {
      player1: { select: { id: true, name: true } },
      player2: { select: { id: true, name: true } },
      winner: { select: { id: true, name: true } },
      tournament: { select: { id: true, name: true } },
      points: { where: { userId } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const upcomingMatches = await prisma.match.findMany({
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
  });

  const totalPoints = participations.reduce((sum, p) => sum + p.totalPoints, 0);
  const totalWins = participations.reduce((sum, p) => sum + p.wins, 0);
  const totalLosses = participations.reduce((sum, p) => sum + p.losses, 0);
  const activeTournaments = participations.filter(
    (p) => p.tournament.status === "IN_PROGRESS" || p.tournament.status === "REGISTRATION"
  ).length;

  const organizedTournaments = await prisma.tournament.findMany({
    where: { organizerId: userId, status: { not: "FINISHED" } },
    include: { _count: { select: { participants: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">
            Bem-vindo, <span className="text-amber-400">{session.user.name}</span>!
          </h1>
          <p className="text-gray-400 mt-1">
            {session.user.role === "ORGANIZER"
              ? "Gerencie seus torneios e acompanhe a classificação."
              : "Acompanhe suas partidas e suba no ranking."}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total de Pontos", value: totalPoints, icon: "⭐", color: "text-amber-400" },
            { label: "Vitórias", value: totalWins, icon: "🏆", color: "text-green-400" },
            { label: "Derrotas", value: totalLosses, icon: "💀", color: "text-red-400" },
            { label: "Torneios Ativos", value: activeTournaments, icon: "🌀", color: "text-blue-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
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
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Próximas Partidas</h2>
            {upcomingMatches.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Nenhuma partida agendada</p>
            ) : (
              <div className="space-y-3">
                {upcomingMatches.map((match) => {
                  const opponent =
                    match.player1Id === userId ? match.player2 : match.player1;
                  return (
                    <Link
                      key={match.id}
                      href={`/tournaments/${match.tournament.id}`}
                      className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-750 rounded-lg transition-colors"
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
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Batalhas Recentes</h2>
            {recentMatches.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Nenhum histórico de partidas ainda</p>
            ) : (
              <div className="space-y-3">
                {recentMatches.map((match) => {
                  const isWinner = match.winnerId === userId;
                  const opponent =
                    match.player1Id === userId ? match.player2 : match.player1;
                  const matchPoints = match.points;
                  const pointsEarned = matchPoints.reduce((sum, p) => sum + p.points, 0);
                  const finishTypes = matchPoints.map((p) => FINISH_TYPE_LABELS[p.finishType as FinishType]);

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
                        <div className={`text-sm font-bold ${isWinner ? "text-amber-400" : "text-gray-500"}`}>
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
                <GenerateInviteButton />
                <Link
                  href="/tournaments/create"
                  className="bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  + Novo Torneio
                </Link>
              </div>
            </div>
            {organizedTournaments.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Nenhum torneio ativo. Crie um para começar!</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {organizedTournaments.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tournaments/${t.id}`}
                    className="bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg p-4 transition-colors"
                  >
                    <div className="font-semibold text-white mb-1">{t.name}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>{t._count.participants} participantes</span>
                      <span>·</span>
                      <span className={`font-medium ${
                        t.status === "IN_PROGRESS" ? "text-green-400" : "text-amber-400"
                      }`}>{STATUS_LABELS[t.status] || t.status}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* My Tournaments */}
        {session.user.role === "PARTICIPANT" && participations.length > 0 && (
          <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Meus Torneios</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {participations.map((p) => (
                <Link
                  key={p.id}
                  href={`/tournaments/${p.tournament.id}`}
                  className="bg-gray-800 border border-gray-700 hover:border-amber-500/40 rounded-lg p-4 transition-colors"
                >
                  <div className="font-semibold text-white mb-2">{p.tournament.name}</div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-amber-400 font-bold">{p.totalPoints} pts</span>
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
