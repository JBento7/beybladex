import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import StartTournamentButton from "./StartTournamentButton";
import ScoreModal from "./ScoreModal";
import ClientJoinButton from "./ClientJoinButton";
import type { TournamentFormat, TournamentStatus, MatchStatus } from "@prisma/client";

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  ROUND_ROBIN: "Pontos Corridos",
  GROUPS: "Grupos",
  SINGLE_ELIMINATION: "Eliminação Simples",
  SWISS: "Suíço",
};

const STATUS_LABELS: Record<TournamentStatus, string> = {
  DRAFT: "Rascunho",
  REGISTRATION: "Inscrições Abertas",
  IN_PROGRESS: "Em Andamento",
  FINISHED: "Finalizado",
};

const STATUS_STYLES: Record<TournamentStatus, string> = {
  DRAFT: "bg-gray-700 text-gray-400",
  REGISTRATION: "bg-amber-500/20 text-amber-400",
  IN_PROGRESS: "bg-green-500/20 text-green-400",
  FINISHED: "bg-gray-700 text-gray-500",
};

type MatchWithRelations = {
  id: string;
  round: number;
  bracketPos: number | null;
  status: MatchStatus;
  player1: { id: string; name: string };
  player2: { id: string; name: string };
  winner: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  points: { id: string; userId: string; finishType: string; points: number }[];
};

function getRoundName(round: number, totalRounds: number, format?: string): string {
  // Pontos Corridos (ROUND_ROBIN): round 1 = fase de grupos, round 2 = semifinais, round 3 = final
  if (format === "ROUND_ROBIN") {
    if (round === 1) return "Fase de Pontos Corridos";
    if (round === 2) return "Semifinais";
    if (round === 3) return "Final";
  }
  const roundsFromEnd = totalRounds - round;
  if (roundsFromEnd === 0) return "Final";
  if (roundsFromEnd === 1) return "Semifinal";
  if (roundsFromEnd === 2) return "Quartas de Final";
  return `Rodada ${round}`;
}

function MatchCard({
  match,
  isOrganizer,
  tournamentId,
}: {
  match: MatchWithRelations;
  isOrganizer: boolean;
  tournamentId: string;
}) {
  const isFinished = match.status === "FINISHED";
  const p1Points = match.points
    .filter((p) => p.userId === match.player1.id)
    .reduce((s, p) => s + p.points, 0);
  const p2Points = match.points
    .filter((p) => p.userId === match.player2.id)
    .reduce((s, p) => s + p.points, 0);

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-lg border ${
        isFinished
          ? "bg-gray-800 border-gray-700"
          : "bg-gray-800/50 border-gray-700/50"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-sm font-semibold truncate ${
              match.winner?.id === match.player1.id
                ? "text-amber-400"
                : isFinished
                ? "text-gray-500"
                : "text-white"
            }`}
          >
            {match.player1.name}
          </span>
          {isFinished && (
            <span className="text-sm font-bold text-amber-400 flex-shrink-0">
              {p1Points}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <span
            className={`text-sm font-semibold truncate ${
              match.winner?.id === match.player2.id
                ? "text-amber-400"
                : isFinished
                ? "text-gray-500"
                : "text-white"
            }`}
          >
            {match.player2.name}
          </span>
          {isFinished && (
            <span className="text-sm font-bold text-amber-400 flex-shrink-0">
              {p2Points}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`text-xs px-2 py-1 rounded-full font-medium ${
            match.status === "FINISHED"
              ? "bg-gray-700 text-gray-400"
              : match.status === "IN_PROGRESS"
              ? "bg-green-500/20 text-green-400"
              : "bg-gray-700/50 text-gray-500"
          }`}
        >
          {match.status === "FINISHED"
            ? "Encerrada"
            : match.status === "IN_PROGRESS"
            ? "Ao Vivo"
            : "Pendente"}
        </span>
        {isOrganizer && !isFinished && (
          <ScoreModal
            matchId={match.id}
            player1={match.player1}
            player2={match.player2}
            tournamentId={tournamentId}
          />
        )}
      </div>
    </div>
  );
}

export default async function TournamentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      organizer: { select: { id: true, name: true } },
      participants: {
        include: {
          user: { select: { id: true, name: true, beyblade: true } },
          group: true,
        },
        orderBy: { totalPoints: "desc" },
      },
      groups: true,
      matches: {
        include: {
          player1: { select: { id: true, name: true } },
          player2: { select: { id: true, name: true } },
          winner: { select: { id: true, name: true } },
          points: true,
          group: true,
        },
        orderBy: [{ round: "asc" }, { bracketPos: "asc" }],
      },
    },
  });

  if (!tournament) notFound();

  const isOrganizerOfThis = session?.user.id === tournament.organizerId;
  const isParticipant = tournament.participants.some(
    (p) => p.userId === session?.user.id
  );
  const canJoin =
    session &&
    session.user.role === "PARTICIPANT" &&
    tournament.status === "REGISTRATION" &&
    !isParticipant &&
    (!tournament.maxParticipants ||
      tournament.participants.length < tournament.maxParticipants);

  // Group matches by round
  const rounds = new Map<number, typeof tournament.matches>();
  for (const match of tournament.matches) {
    if (!rounds.has(match.round)) rounds.set(match.round, []);
    rounds.get(match.round)!.push(match);
  }
  const sortedRounds = Array.from(rounds.entries()).sort((a, b) => a[0] - b[0]);

  // Group participants by group (for GROUPS format)
  const groupMap = new Map<
    string,
    {
      group: { id: string; name: string };
      participants: typeof tournament.participants;
    }
  >();
  if (tournament.format === "GROUPS") {
    for (const p of tournament.participants) {
      if (p.group) {
        if (!groupMap.has(p.group.id)) {
          groupMap.set(p.group.id, { group: p.group, participants: [] });
        }
        groupMap.get(p.group.id)!.participants.push(p);
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_STYLES[tournament.status]}`}
                >
                  {STATUS_LABELS[tournament.status]}
                </span>
                <span className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full font-medium">
                  {FORMAT_LABELS[tournament.format]}
                </span>
              </div>
              <h1 className="text-3xl font-black text-white mb-2">
                {tournament.name}
              </h1>
              {tournament.description && (
                <p className="text-gray-400">{tournament.description}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-500">
                <span>👑 Organizado por {tournament.organizer.name}</span>
                <span>
                  👥 {tournament.participants.length}
                  {tournament.maxParticipants
                    ? ` / ${tournament.maxParticipants}`
                    : ""}{" "}
                  participantes
                </span>
                {tournament.startDate && (
                  <span>
                    📅 {new Date(tournament.startDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {canJoin && (
                <ClientJoinButton tournamentId={tournament.id} deckType={tournament.deckType} />
              )}
              {isParticipant && tournament.status === "REGISTRATION" && (
                <span className="text-sm bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg font-medium text-center">
                  ✓ Você está inscrito
                </span>
              )}
              {isOrganizerOfThis &&
                tournament.status === "REGISTRATION" &&
                tournament.participants.length >= 2 && (
                  <StartTournamentButton tournamentId={tournament.id} />
                )}
              {isOrganizerOfThis && (
                <Link
                  href="/dashboard"
                  className="text-sm text-center text-gray-400 hover:text-white transition-colors"
                >
                  ← Voltar ao Painel
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {sortedRounds.length > 0 ? (
              sortedRounds.map(([round, matches]: [number, typeof tournament.matches]) => (
                <div
                  key={round}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-6"
                >
                  <h2 className="text-lg font-bold text-white mb-4">
                    {(tournament.format === "SINGLE_ELIMINATION" || tournament.format === "ROUND_ROBIN")
                      ? getRoundName(round, sortedRounds.length, tournament.format)
                      : `Rodada ${round}`}
                  </h2>
                  <div className="space-y-3">
                    {matches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        isOrganizer={isOrganizerOfThis}
                        tournamentId={tournament.id}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : tournament.status === "REGISTRATION" ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">⏳</div>
                <h3 className="text-lg font-bold text-white mb-2">
                  Aguardando Jogadores
                </h3>
                <p className="text-gray-400 text-sm">
                  As partidas serão geradas quando o organizador iniciar o torneio.
                </p>
                {isOrganizerOfThis && (
                  <p className="text-amber-400 text-sm mt-2">
                    Você precisa de pelo menos 2 participantes para iniciar.
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">🌀</div>
                <p className="text-gray-400">No matches yet.</p>
              </div>
            )}
          </div>

          {/* Sidebar: Standings */}
          <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">Classificação</h2>
              {tournament.participants.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  Nenhum participante ainda
                </p>
              ) : (
                <div className="space-y-2">
                  {tournament.participants.map((p, idx) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        idx === 0
                          ? "bg-amber-500/10 border border-amber-500/20"
                          : "bg-gray-800"
                      }`}
                    >
                      <span
                        className={`text-sm font-black w-6 text-center ${
                          idx === 0
                            ? "text-amber-400"
                            : idx === 1
                            ? "text-gray-300"
                            : idx === 2
                            ? "text-amber-700"
                            : "text-gray-600"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {p.user.name}
                        </div>
                        {p.user.beyblade && (
                          <div className="text-xs text-gray-500 truncate">
                            {p.user.beyblade}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-amber-400">
                          {p.totalPoints}pts
                        </div>
                        <div className="text-xs text-gray-500">
                          {p.wins}W-{p.losses}L
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Groups (if applicable) */}
            {tournament.format === "GROUPS" && groupMap.size > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Grupos</h2>
                <div className="space-y-4">
                  {Array.from(groupMap.values()).map(({ group, participants }) => (
                    <div key={group.id}>
                      <div className="text-sm font-bold text-amber-400 mb-2">
                        {group.name}
                      </div>
                      <div className="space-y-1">
                        {participants
                          .sort((a, b) => b.totalPoints - a.totalPoints)
                          .map((p, idx) => (
                            <div
                              key={p.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <span className="text-gray-500 w-4">
                                {idx + 1}.
                              </span>
                              <span className="text-gray-300 flex-1">
                                {p.user.name}
                              </span>
                              <span className="text-amber-400 font-medium">
                                {p.totalPoints}pts
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Participants list */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">
                Participantes ({tournament.participants.length})
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {tournament.participants.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-2">
                    Nenhum participante ainda
                  </p>
                ) : (
                  tournament.participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0"
                    >
                      <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400">
                        {p.user.name[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {p.user.name}
                        </div>
                        {p.user.beyblade && (
                          <div className="text-xs text-gray-500">
                            {p.user.beyblade}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
