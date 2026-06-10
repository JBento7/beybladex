import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import StartTournamentButton from "./StartTournamentButton";
import ScoreModal from "./ScoreModal";
import ClientJoinButton from "./ClientJoinButton";
import AdminParticipantManager from "./AdminParticipantManager";
import type { TournamentFormat, TournamentStatus, MatchStatus } from "@prisma/client";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const t = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { name: true },
  });
  return { title: t?.name ?? "Torneio" };
}

const FORMAT_LABELS: Partial<Record<TournamentFormat, string>> & Record<string, string> = {
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
  arena: number | null;
  slot: number | null;
  status: MatchStatus;
  player1: { id: string; name: string; bladerName: string | null };
  player2: { id: string; name: string; bladerName: string | null };
  winner: { id: string; name: string; bladerName: string | null } | null;
  group: { id: string; name: string } | null;
  points: { userId: string; points: number }[];
};

function getRoundName(round: number, totalRounds: number, format?: string): string {
  if (format === "ROUND_ROBIN") {
    return "Fase de Pontos Corridos";
  }
  const roundsFromEnd = totalRounds - round;
  if (roundsFromEnd === 0) return "Final";
  if (roundsFromEnd === 1) return "Semifinal";
  if (roundsFromEnd === 2) return "Quartas de Final";
  return `Rodada ${round}`;
}

type BeybladeInfo = { id: string; name: string; blade: string | null; ratchet: string | null; bit: string | null };
type ParticipantBeyblades = { userId: string; beyblades: BeybladeInfo[] };

function MatchCard({
  match,
  isOrganizer,
  tournamentId,
  participantBeyblades,
}: {
  match: MatchWithRelations;
  isOrganizer: boolean;
  tournamentId: string;
  participantBeyblades: ParticipantBeyblades[];
}) {
  const isFinished = match.status === "FINISHED";
  const p1Points = match.points
    .filter((p) => p.userId === match.player1.id)
    .reduce((s, p) => s + p.points, 0);
  const p2Points = match.points
    .filter((p) => p.userId === match.player2.id)
    .reduce((s, p) => s + p.points, 0);

  // Bye: a self-match (player1 === player2) where the player advances without
  // playing because the bracket field wasn't a power of two.
  if (match.player1.id === match.player2.id) {
    return (
      <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-dashed border-gray-700 bg-gray-800/40">
        <span className="text-sm font-semibold text-amber-400 truncate">
          {match.player1.bladerName || match.player1.name}
        </span>
        <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-700 text-gray-400 flex-shrink-0">
          Passou (bye)
        </span>
      </div>
    );
  }

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
            {match.player1.bladerName || match.player1.name}
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
            {match.player2.bladerName || match.player2.name}
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
            player1Beyblades={participantBeyblades.find(p => p.userId === match.player1.id)?.beyblades ?? []}
            player2Beyblades={participantBeyblades.find(p => p.userId === match.player2.id)?.beyblades ?? []}
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
  try {
  const session = await getServerSession(authOptions);

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      organizer: { select: { id: true, name: true } },
      participants: {
        include: {
          user: { select: { id: true, name: true, bladerName: true, isGuest: true } },
          group: true,
        },
        orderBy: { totalPoints: "desc" },
      },
      groups: true,
      matches: {
        include: {
          player1: { select: { id: true, name: true, bladerName: true } },
          player2: { select: { id: true, name: true, bladerName: true } },
          winner: { select: { id: true, name: true, bladerName: true } },
          points: { select: { userId: true, points: true } },
          group: true,
        },
        orderBy: [{ round: "asc" }, { slot: "asc" }, { arena: "asc" }],
      },
    },
  });

  if (!tournament) notFound();

  const isOrganizerOfThis = !!session && session.user.id === tournament.organizerId;
  // Any ORGANIZER-role user can manage participants (not just the creator)
  const isAdminUser = !!session && session.user.role === "ORGANIZER";

  // Collect all beyblade IDs registered by participants
  const allBeybladeIds = tournament.participants.flatMap((p) =>
    [p.beyblade1, p.beyblade2, p.beyblade3].filter(Boolean) as string[]
  );

  // These two reads are independent — batch them in a single round-trip
  const [beybladeDetails, allPlayers] = await Promise.all([
    allBeybladeIds.length > 0
      ? prisma.beyblade.findMany({
          where: { id: { in: allBeybladeIds } },
          select: { id: true, name: true, blade: true, ratchet: true, bit: true },
        })
      : Promise.resolve([]),
    // Any organizer-role user gets the full player list for the admin panel
    isAdminUser
      ? prisma.user.findMany({
          where: { deleted: false, isGuest: false },
          select: {
            id: true,
            name: true,
            beyblades: { select: { id: true, name: true } },
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const beybladeMap = new Map(beybladeDetails.map((b) => [b.id, b]));

  type BeybladeWithUser = BeybladeInfo & { userId: string };
  const allParticipantBeyblades: Map<string, BeybladeInfo[]> = new Map();
  if (!tournament.isOfficial) {
    const participantUserIds = tournament.participants.map((p) => p.userId);
    const allBeys = await prisma.beyblade.findMany({
      where: { userId: { in: participantUserIds } },
      select: { id: true, name: true, blade: true, ratchet: true, bit: true, userId: true },
    }) as BeybladeWithUser[];
    for (const b of allBeys) {
      if (!allParticipantBeyblades.has(b.userId)) allParticipantBeyblades.set(b.userId, []);
      allParticipantBeyblades.get(b.userId)!.push({ id: b.id, name: b.name, blade: b.blade, ratchet: b.ratchet, bit: b.bit });
    }
  }

  const participantBeyblades: ParticipantBeyblades[] = tournament.participants.map((p) => ({
    userId: p.userId,
    beyblades: !tournament.isOfficial && allParticipantBeyblades.has(p.userId)
      ? allParticipantBeyblades.get(p.userId)!
      : [p.beyblade1, p.beyblade2, p.beyblade3]
          .filter(Boolean)
          .map((id) => beybladeMap.get(id!))
          .filter(Boolean) as BeybladeInfo[],
  }));
  const isParticipant = tournament.participants.some(
    (p) => p.userId === session?.user.id
  );

  // For Round Robin tournaments, ties in totalPoints are broken by point
  // differential (points scored - points conceded across finished matches).
  let standingsParticipants = tournament.participants;
  if (tournament.format === "ROUND_ROBIN") {
    const diff = new Map<string, number>();
    for (const m of tournament.matches) {
      if (m.status !== "FINISHED") continue;
      const p1Pts = m.points.filter((p) => p.userId === m.player1.id).reduce((s, p) => s + p.points, 0);
      const p2Pts = m.points.filter((p) => p.userId === m.player2.id).reduce((s, p) => s + p.points, 0);
      diff.set(m.player1.id, (diff.get(m.player1.id) ?? 0) + (p1Pts - p2Pts));
      diff.set(m.player2.id, (diff.get(m.player2.id) ?? 0) + (p2Pts - p1Pts));
    }
    standingsParticipants = [...tournament.participants].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return (diff.get(b.userId) ?? 0) - (diff.get(a.userId) ?? 0);
    });
  }

  const canJoin =
    session &&
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
                {!tournament.isOfficial && (
                  <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/40 px-3 py-1 rounded-full font-semibold">
                    🎮 BeyEncontro
                  </span>
                )}
              </div>
              {!tournament.isOfficial && (
                <div className="bg-blue-900/20 border border-blue-600/30 text-blue-300 text-sm px-4 py-2.5 rounded-lg mb-3">
                  🎮 BeyEncontro — Estatísticas de beyblade são registradas, mas os pontos não contam no ranking da comunidade.
                </div>
              )}
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
                    📅 {new Date(tournament.startDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
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
              {isAdminUser &&
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
              sortedRounds.map(([round, roundMatches]: [number, typeof tournament.matches]) => {
                const arenaCount = tournament.arenas ?? 1;
                // Use stored arena/slot from DB — these are fixed at match creation time
                const useStoredArenas = arenaCount > 1 && roundMatches.some((m) => m.arena != null);
                const slots = useStoredArenas
                  ? [...new Set(roundMatches.map((m) => m.slot ?? 0))].sort((a, b) => a - b)
                  : [];

                return (
                  <div key={round} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h2 className="text-lg font-bold text-white mb-4">
                      {(tournament.format === "SINGLE_ELIMINATION" || tournament.format === "ROUND_ROBIN")
                        ? getRoundName(round, sortedRounds.length, tournament.format)
                        : `Rodada ${round}`}
                    </h2>

                    {useStoredArenas ? (
                      <div className="overflow-x-auto">
                        {/* Arena column headers */}
                        <div
                          className="grid gap-3 mb-3 min-w-0"
                          style={{ gridTemplateColumns: `repeat(${arenaCount}, minmax(180px, 1fr))` }}
                        >
                          {Array.from({ length: arenaCount }, (_, i) => (
                            <div key={i} className="text-center text-xs font-bold text-[#f0a500] bg-[#f0a500]/10 border border-[#f0a500]/20 rounded-lg py-1.5">
                              Arena {i + 1}
                            </div>
                          ))}
                        </div>
                        {/* One fixed row per slot */}
                        {slots.map((slot) => (
                          <div
                            key={slot}
                            className="grid gap-3 mb-3"
                            style={{ gridTemplateColumns: `repeat(${arenaCount}, minmax(180px, 1fr))` }}
                          >
                            {Array.from({ length: arenaCount }, (_, i) => {
                              const match = roundMatches.find(
                                (m) => (m.slot ?? 0) === slot && (m.arena ?? 1) === i + 1
                              );
                              if (!match) {
                                return (
                                  <div key={i} className="border border-dashed border-gray-800 rounded-lg flex items-center justify-center py-6">
                                    <span className="text-gray-700 text-xs">livre</span>
                                  </div>
                                );
                              }
                              return (
                                <MatchCard
                                  key={match.id}
                                  match={match}
                                  isOrganizer={isOrganizerOfThis}
                                  tournamentId={tournament.id}
                                  participantBeyblades={participantBeyblades}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {roundMatches.map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            isOrganizer={isOrganizerOfThis}
                            tournamentId={tournament.id}
                            participantBeyblades={participantBeyblades}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
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
                <div className="mb-3"><img src="/bey-removebg-preview.png" alt="" className="w-10 h-10 object-contain mx-auto" /></div>
                <p className="text-gray-400">Nenhuma partida ainda.</p>
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
                  {standingsParticipants.map((p, idx) => (
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
                          {p.user.bladerName || p.user.name}
                          {p.user.isGuest && <span className="ml-1.5 text-[10px] text-gray-500 font-normal">convidado</span>}
                        </div>
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
                                {p.user.bladerName || p.user.name}
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
              {isAdminUser && tournament.status !== "FINISHED" ? (
                <AdminParticipantManager
                  tournamentId={tournament.id}
                  deckType={tournament.deckType}
                  tournamentStatus={tournament.status}
                  isOfficial={tournament.isOfficial}
                  participants={tournament.participants.map((p) => ({
                    userId: p.userId,
                    user: p.user,
                    beyblade1: p.beyblade1,
                    beyblade2: p.beyblade2,
                    beyblade3: p.beyblade3,
                  }))}
                  allPlayers={allPlayers}
                />
              ) : (
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
                          {(p.user.bladerName || p.user.name)[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">
                            {p.user.bladerName || p.user.name}
                            {p.user.isGuest && <span className="ml-1.5 text-[10px] text-gray-500">convidado</span>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
  } catch (e) {
    console.error("[tournament detail]", e);
    return (
      <div className="min-h-screen bg-[#0d0d0d]">
        <Navbar />
        <div className="flex items-center justify-center p-8">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 max-w-md w-full text-center mt-16">
            <div className="mb-4"><img src="/bey-removebg-preview.png" alt="" className="w-10 h-10 object-contain mx-auto" /></div>
            <h2 className="text-xl font-bold text-white mb-2">Erro ao carregar torneio</h2>
            <p className="text-gray-400 text-sm mb-6">
              Não foi possível carregar este torneio. Tente novamente em instantes.
            </p>
            <Link
              href="/tournaments"
              className="inline-block bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold text-sm px-5 py-2.5 rounded-lg transition-colors"
            >
              Ver todos os torneios
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
