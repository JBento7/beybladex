import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditSwiss, isSwissFormat } from "@/lib/swiss";
import { decideMatchOp, effectiveJudgingMode } from "@/lib/matchPolicy";
import { actorOf } from "@/lib/matchAccess";
import { registrationState } from "@/lib/registration";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import StartTournamentButton from "./StartTournamentButton";
import FinishTournamentButton from "./FinishTournamentButton";
import ResetTournamentButton from "./ResetTournamentButton";
import AutoplaySwissButton from "./AutoplaySwissButton";
import LaunchVideoButton from "./LaunchVideoButton";
import ScoreModal from "./ScoreModal";
import PlayerDeckOrder from "./PlayerDeckOrder";
import PlayerTrioPanel from "./PlayerTrioPanel";
import ClientJoinButton from "./ClientJoinButton";
import EditBeybladesButton from "./EditBeybladesButton";
import FinalsDeckButton from "./FinalsDeckButton";
import WOButton from "./WOButton";
import JudgingModeToggle from "./JudgingModeToggle";
import RetryAdvanceButton from "./RetryAdvanceButton";
import AdminParticipantManager from "./AdminParticipantManager";
import AdminMatchEditor from "./AdminMatchEditor";
import ShareButton from "@/components/ShareButton";
import AutoRefresh from "@/components/AutoRefresh";
import { isJudgeAccount } from "@/lib/judgeAccount";
import { communityOf } from "@/lib/communities";
import { computeSwissStandings, computeSwissFinalPlacement, comparePlacements, decidedPodium, type PlacementDivergence, type StandingsMatch } from "@/lib/standings";
import RichText, { isLongText } from "@/components/RichText";
import ExpandableText from "@/components/ExpandableText";
import RetryButton from "@/components/RetryButton";
import type { TournamentFormat, TournamentStatus, MatchStatus } from "@prisma/client";
import type { Metadata } from "next";
import { canSeeDraft } from "@/lib/tournamentList";
import { knockoutRules, setsLabel } from "@/lib/matchRules";
import { authUrl } from "@/lib/safeRedirect";
import { testToolsAllowed } from "@/lib/adminAudit";
import { deckLabel, hasMatchTrio, PLUS_ONE_PARTS_RULE, registeredIds, usesBattleDeck } from "@/lib/deckFormat";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const t = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { name: true, status: true },
  });
  return { title: t && t.status !== "DRAFT" ? t.name : "Torneio" };
}

const FORMAT_LABELS: Partial<Record<TournamentFormat, string>> & Record<string, string> = {
  ROUND_ROBIN: "Suíço",
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

// Status chips: text + icon carry the meaning; color is only a reinforcement.
const STATUS_STYLES: Record<TournamentStatus, string> = {
  DRAFT: "bg-gray-700 text-gray-100",
  REGISTRATION: "bg-amber-500/20 text-amber-200 border border-amber-500/40",
  IN_PROGRESS: "bg-green-500/20 text-green-200 border border-green-500/40",
  FINISHED: "bg-gray-700 text-gray-100",
};

type MatchWithRelations = {
  id: string;
  round: number;
  bracketPos: number | null;
  arena: number | null;
  slot: number | null;
  status: MatchStatus;
  isWalkover: boolean;
  isThirdPlace: boolean;
  player1: { id: string; name: string; bladerName: string | null };
  player2: { id: string; name: string; bladerName: string | null };
  winner: { id: string; name: string; bladerName: string | null } | null;
  judge: { id: string; name: string; bladerName: string | null } | null;
  group: { id: string; name: string } | null;
  points: { userId: string; points: number }[];
};

function getRoundName(round: number, totalRounds: number, format?: string, swissRounds = 0): string {
  // Suíço: rounds 1..swissRounds are the Swiss phase; later rounds are the knockout.
  if (isSwissFormat(format) && swissRounds > 0 && round <= swissRounds) {
    return swissRounds === 1 ? "Fase Suíça" : `Suíço · Rodada ${round}`;
  }
  const roundsFromEnd = totalRounds - round;
  if (roundsFromEnd === 0) return "Final";
  if (roundsFromEnd === 1) return "Semifinal";
  if (roundsFromEnd === 2) return "Quartas de Final";
  if (roundsFromEnd === 3) return "Oitavas de Final";
  return `Rodada ${round}`;
}

type BeybladeInfo = { id: string; name: string; blade: string | null; ratchet: string | null; bit: string | null };
type ParticipantBeyblades = { userId: string; beyblades: BeybladeInfo[] };

// A participant's registered deck for display: the snapshot taken at
// registration (3on3 + 1 reserva), falling back to the live Beyblades.
function snapshotOrLive(
  p: { beyblade1: string | null; beyblade2: string | null; beyblade3: string | null; beyblade4: string | null; deckSnapshot: unknown },
  live: Map<string, BeybladeInfo>
): BeybladeInfo[] {
  const snap = Array.isArray(p.deckSnapshot) ? (p.deckSnapshot as BeybladeInfo[]) : [];
  return registeredIds(p)
    .map((id) => snap.find((b) => b.id === id) ?? live.get(id))
    .filter(Boolean)
    .map((b) => ({ id: b!.id, name: b!.name, blade: b!.blade ?? null, ratchet: b!.ratchet ?? null, bit: b!.bit ?? null }));
}

// Blader name for display; admins also see the real name in parentheses.
function playerLabel(p: { name: string; bladerName?: string | null }, admin = false) {
  const blader = p.bladerName || p.name;
  return admin && p.bladerName && p.bladerName.trim() && p.bladerName !== p.name
    ? `${p.bladerName} (${p.name})`
    : blader;
}

type MatchCardProps = {
  match: MatchWithRelations;
  isOrganizer: boolean;
  isAdmin?: boolean;
  deckType?: string;
  openJudging?: boolean;
  /** Same rule as the API (lib/matchPolicy) — decides whether to show "Placar"/W.O. */
  canOperate?: (m: MatchWithRelations) => boolean;
  tournamentId: string;
  participantBeyblades: ParticipantBeyblades[];
  arenaCount?: number;
  currentUserId?: string;
  /** Round name shown on the card (e.g. "Suíço · Rodada 2", "Semifinal"). */
  roundLabel?: string;
  /** What a bye means in this format (Swiss point vs. advancing). */
  byeText?: string;
  /** Integrity problem involving this match (shown with its id to admins). */
  flagged?: Map<string, string>;
};

// One match. Works in a single phone-width column: names wrap instead of being
// cut, the score never moves, and the winner is marked with an icon + text
// (not only color). Shows round, arena and status on every card.
function MatchCard({
  match,
  isOrganizer,
  isAdmin = false,
  tournamentId,
  participantBeyblades,
  arenaCount = 1,
  currentUserId,
  deckType = "SOLO",
  openJudging = false,
  canOperate,
  roundLabel,
  byeText = "Avança sem jogar (bye).",
  flagged,
}: MatchCardProps) {
  const problem = flagged?.get(match.id);
  const flagBox = problem ? (
    <p role="note" className="mt-2 rounded-md border border-warn/40 bg-warn-bg px-2 py-1 text-xs text-gray-100">
      ⚠ {problem}{isAdmin && <span className="block text-gray-300">ID: {match.id}</span>}
    </p>
  ) : null;
  // The page only mirrors the server rule (lib/matchPolicy); the API enforces it.
  const canScore = canOperate ? canOperate(match) : false;
  void isOrganizer; void openJudging;
  const isFinished = match.status === "FINISHED";
  const p1Points = match.points.filter((p) => p.userId === match.player1.id).reduce((s, p) => s + p.points, 0);
  const p2Points = match.points.filter((p) => p.userId === match.player2.id).reduce((s, p) => s + p.points, 0);

  const meta = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
      {roundLabel && <span className="font-semibold text-gray-300">{roundLabel}</span>}
      {match.arena != null && arenaCount > 1 && (
        <span className="px-2 py-0.5 rounded-full font-bold bg-brand-yellow/10 text-amber-200 border border-brand-yellow/30">Arena {match.arena}</span>
      )}
    </div>
  );

  // Bye: a self-match (player1 === player2) — the player has no opponent this round.
  if (match.player1.id === match.player2.id) {
    return (
      <div className="p-3 rounded-lg border border-dashed border-gray-600 bg-gray-800/40">
        {meta}
        <div className="flex items-start justify-between gap-3 mt-2">
          <span className="text-sm font-semibold text-white break-anywhere min-w-0">{playerLabel(match.player1, isAdmin)}</span>
          <span className="shrink-0 text-xs px-2 py-1 rounded-full font-bold bg-gray-700 text-gray-100">Bye</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">{byeText}</p>
        {flagBox}
      </div>
    );
  }

  const row = (player: MatchWithRelations["player1"], pts: number) => {
    const won = isFinished && match.winner?.id === player.id;
    const lostByWo = isFinished && match.isWalkover && !won;
    return (
      <div className="flex items-start justify-between gap-3">
        <span className={`text-sm font-semibold break-anywhere min-w-0 ${won ? "text-amber-300" : isFinished ? "text-gray-400" : "text-white"}`}>
          {won && <span aria-hidden="true">🏆 </span>}
          {playerLabel(player, isAdmin)}
          {won && <span className="sr-only"> — vencedor</span>}
        </span>
        {isFinished && (
          <span className={`shrink-0 text-sm font-black tabular-nums ${won ? "text-amber-300" : "text-gray-400"}`}>
            {match.isWalkover ? (lostByWo ? "W.O." : "Venceu") : pts}
          </span>
        )}
      </div>
    );
  };

  const status = match.status === "FINISHED"
    ? { text: "Encerrada", cls: "bg-gray-700 text-gray-100" }
    : match.status === "IN_PROGRESS"
      ? { text: "● Ao vivo", cls: "bg-green-500/20 text-green-200 border border-green-500/40" }
      : { text: "Pendente", cls: "bg-gray-800 text-gray-200 border border-gray-600" };

  return (
    <div className={`flex flex-col gap-2 p-3 sm:p-4 rounded-lg border ${isFinished ? "bg-gray-800 border-gray-700" : "bg-gray-800/50 border-gray-700/70"}`}>
      <div className="flex items-start justify-between gap-2">
        {meta}
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-bold ${status.cls}`}>{status.text}</span>
      </div>
      <div className="space-y-1">
        {row(match.player1, p1Points)}
        {row(match.player2, p2Points)}
      </div>
      {flagBox}
      {(match.judge || match.isWalkover || (canScore && !isFinished) ||
        (usesBattleDeck(deckType) && !isFinished && currentUserId && (currentUserId === match.player1.id || currentUserId === match.player2.id))) && (
        <div className="flex items-center gap-2 flex-wrap">
          {match.judge && (
            <span className="text-xs px-2 py-1 rounded-full font-semibold bg-purple-500/10 text-purple-200 border border-purple-500/30">
              ⚖️ Juiz: {playerLabel(match.judge, isAdmin)}
            </span>
          )}
          {match.isWalkover && (
            <span className="text-xs px-2 py-1 rounded-full font-bold bg-red-500/20 text-red-200">Vitória por W.O.</span>
          )}
          {canScore && !isFinished && (
            <>
              <ScoreModal
                matchId={match.id}
                player1={match.player1}
                player2={match.player2}
                tournamentId={tournamentId}
                player1Beyblades={participantBeyblades.find(p => p.userId === match.player1.id)?.beyblades ?? []}
                player2Beyblades={participantBeyblades.find(p => p.userId === match.player2.id)?.beyblades ?? []}
                deckType={deckType}
              />
              <WOButton matchId={match.id} player1={match.player1} player2={match.player2} />
            </>
          )}
          {/* 3on3 + 1 reserva: the player picks this match's trio on their phone */}
          {hasMatchTrio(deckType) && !isFinished && match.player1.id !== match.player2.id && currentUserId &&
            (currentUserId === match.player1.id || currentUserId === match.player2.id) && (
              <PlayerTrioPanel matchId={match.id} userId={currentUserId} color={currentUserId === match.player1.id ? "#f0a500" : "#c8102e"} />
            )}
          {/* Player picks their own deck order on their phone (3-on-3 only) */}
          {usesBattleDeck(deckType) && !isFinished && currentUserId &&
            (currentUserId === match.player1.id || currentUserId === match.player2.id) && (
              <PlayerDeckOrder
                matchId={match.id}
                userId={currentUserId}
                beyblades={participantBeyblades.find((p) => p.userId === currentUserId)?.beyblades ?? []}
                color={currentUserId === match.player1.id ? "#f0a500" : "#c8102e"}
                trioMode={hasMatchTrio(deckType)}
              />
            )}
        </div>
      )}
    </div>
  );
}

// Graphic bracket — an alternative view; the caller puts it in its own
// horizontally-scrollable box so it never widens the page.
function BracketView({
  rounds,
  totalRounds,
  labelOf,
  ...cardProps
}: Omit<MatchCardProps, "match" | "roundLabel"> & {
  rounds: [number, MatchWithRelations[]][];
  totalRounds: number;
  labelOf?: (round: number) => string;
}) {
  const CARD_WIDTH = 240;
  const GAP = 32;
  const BASE_SLOT = 190;
  const label = (round: number) => labelOf ? labelOf(round) : getRoundName(round, totalRounds, "SINGLE_ELIMINATION");

  return (
    <div className="flex" style={{ width: rounds.length * (CARD_WIDTH + GAP) }}>
      {rounds.map(([round, matches], r) => {
        // Cap the slot-height growth so deep brackets don't create huge empty
        // vertical gaps (e.g. a 16-player final reserving 1400px of space).
        const slotHeight = BASE_SLOT * Math.pow(2, Math.min(r, 2));
        return (
          <div key={round} className="flex-shrink-0" style={{ width: CARD_WIDTH + GAP }}>
            <h4 className="text-center text-sm font-bold text-gray-300 mb-3">{label(round)}</h4>
            {matches.map((match, i) => (
              <div key={match.id} className="relative flex items-center" style={{ height: slotHeight }}>
                <div style={{ width: CARD_WIDTH }}>
                  <MatchCard match={match} roundLabel={label(round)} {...cardProps} />
                </div>
                {r < rounds.length - 1 && (
                  <div
                    aria-hidden="true"
                    className="absolute border-gray-600"
                    style={{
                      left: CARD_WIDTH,
                      width: GAP,
                      height: slotHeight / 2,
                      top: i % 2 === 0 ? "50%" : 0,
                      borderRightWidth: 2,
                      borderTopWidth: i % 2 === 1 ? 2 : 0,
                      borderBottomWidth: i % 2 === 0 ? 2 : 0,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default async function TournamentDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ aba?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  try {
  const session = await getServerSession(authOptions);

  // Viewing a page never changes the tournament (no round generation here):
  // rounds advance when a result closes the round (point / W.O. / correction),
  // and an organizer can retry from the admin tools. See docs/OPERACAO.md.
  //
  // Data is loaded per tab: "Regras" reads no matches/points at all, "Resumo"
  // reads matches without points, "Classificação"/"Partidas" read per-player
  // point SUMS (one aggregate) instead of every point row, and sets only for
  // admins on "Partidas".
  const meta = await prisma.tournament.findUnique({ where: { id: params.id }, select: { status: true, organizerId: true, communitySlug: true, isPartnership: true } });
  // Drafts are private: only the organizer and admins of the league see them.
  if (!meta || (meta.status === "DRAFT" && !canSeeDraft(session, meta))) notFound();
  const TAB_KEYS = ["resumo", "classificacao", "partidas", "regras"] as const;
  type TabKey = (typeof TAB_KEYS)[number];
  const kioskViewer = isJudgeAccount(session?.user?.email);
  const tab: TabKey = kioskViewer
    ? "partidas"
    : (TAB_KEYS as readonly string[]).includes(searchParams?.aba ?? "")
      ? (searchParams!.aba as TabKey)
      : meta.status === "IN_PROGRESS" ? "partidas" : "resumo";
  const needParticipants = tab !== "regras";
  const needMatches = tab !== "regras";
  const needPoints = tab === "classificacao" || tab === "partidas";
  const needSets = tab === "partidas" && session?.user.role === "ORGANIZER";
  const NONE = { id: "__none__" }; // keeps the relation (and its types) but returns nothing

  const [loaded, pointSums] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: params.id },
      include: {
        organizer: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
        participants: {
          where: needParticipants ? {} : NONE,
          include: {
            user: { select: { id: true, name: true, bladerName: true, isGuest: true } },
            group: true,
          },
          orderBy: [{ totalPoints: "desc" }, { id: "asc" }],
        },
        groups: tab === "classificacao" ? true : { where: NONE },
        judges: {
          include: { user: { select: { id: true, name: true, bladerName: true } } },
        },
        matches: {
          where: needMatches ? {} : NONE,
          include: {
            player1: { select: { id: true, name: true, bladerName: true } },
            player2: { select: { id: true, name: true, bladerName: true } },
            winner: { select: { id: true, name: true, bladerName: true } },
            judge: { select: { id: true, name: true, bladerName: true } },
            sets: { where: needSets ? {} : NONE, select: { winnerId: true, setNumber: true, player1Points: true, player2Points: true } },
            group: true,
          },
          orderBy: [{ round: "asc" }, { slot: "asc" }, { arena: "asc" }, { id: "asc" }],
        },
      },
    }),
    // Battle points per match and player, summed in the database (the same
    // numbers the standings add up), instead of transporting every point.
    needPoints
      ? prisma.matchPoint.groupBy({ by: ["matchId", "userId"], where: { match: { tournamentId: params.id } }, _sum: { points: true } })
      : Promise.resolve([] as { matchId: string; userId: string; _sum: { points: number | null } }[]),
  ]);
  if (!loaded) notFound();
  // Attach the aggregated points to each match in the shape the page uses.
  const byMatch = new Map<string, { userId: string; points: number }[]>();
  for (const g of pointSums) {
    const list = byMatch.get(g.matchId) ?? [];
    list.push({ userId: g.userId, points: g._sum.points ?? 0 });
    byMatch.set(g.matchId, list);
  }
  const tournament = { ...loaded, matches: loaded.matches.map((m) => ({ ...m, points: byMatch.get(m.id) ?? [] })) };
  const participantCount = tournament._count.participants;

  const isOrganizerOfThis = !!session && session.user.id === tournament.organizerId;
  // Any ORGANIZER-role user can manage participants (not just the creator)
  const isAdminUser = !!session && session.user.role === "ORGANIZER";
  // Admins can grant individual users permission to judge matches
  // (score points / declare W.O.) across tournaments and BeyEncontros.
  const hasJudgePermission = !!session && session.user.canJudge;

  // In official tournaments, only admins or users with judge permission can
  // act as judges — even if they're also competing, since judging is
  // account-wide and doesn't depend on which arena a match is being played
  // in. In BeyEncontros, the creator, admins, or users with judge permission
  // can judge.
  const canJudge = tournament.isOfficial
    ? isAdminUser || hasJudgePermission
    : isOrganizerOfThis || isAdminUser || hasJudgePermission;

  // Open judging is an explicit event setting now (never "no judges assigned").
  const openJudging = effectiveJudgingMode(tournament) === "OPEN_PARTICIPANTS";
  const policyActor = actorOf(session);
  const actorIsParticipant = !!tournament.participants.find((p) => p.userId === session?.user.id && (p as { approved?: boolean }).approved !== false);
  const canOperate = (m: { player1: { id: string }; player2: { id: string }; judge: { id: string } | null }) =>
    decideMatchOp(policyActor, {
      judgeId: m.judge?.id ?? null,
      player1Id: m.player1.id,
      player2Id: m.player2.id,
      tournament: { organizerId: tournament.organizerId, isOfficial: tournament.isOfficial, isTest: tournament.isTest, communitySlug: tournament.communitySlug, isPartnership: tournament.isPartnership, judgingMode: tournament.judgingMode },
      actorIsParticipant,
    }, "score").allowed;

  // Editing (name, format, deck type, arenas, etc.) is only allowed before
  // the event starts. Official tournaments: admins only. BeyEncontros: the
  // creator or any admin.
  const canEditTournament =
    (tournament.status === "DRAFT" || tournament.status === "REGISTRATION") &&
    (tournament.isOfficial ? isAdminUser : isAdminUser || isOrganizerOfThis);


  // Collect all beyblade IDs registered by participants
  const allBeybladeIds = tournament.participants.flatMap((p) => registeredIds(p));

  // These two reads are independent — batch them in a single round-trip
  const [beybladeDetails, allPlayers] = await Promise.all([
    allBeybladeIds.length > 0
      ? prisma.beyblade.findMany({
          where: { id: { in: allBeybladeIds } },
          select: { id: true, name: true, blade: true, ratchet: true, bit: true },
        })
      : Promise.resolve([]),
    // Any organizer-role user gets the full player list for the admin panel
    // (only on "Resumo", where the participant manager lives).
    isAdminUser && tab === "resumo" && tournament.status !== "FINISHED"
      ? prisma.user.findMany({
          where: { deleted: false, isGuest: false, NOT: [{ email: { endsWith: ".arena" } }, { email: { endsWith: ".juiz" } }] },
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
  // 3on3 + 1 reserva: only the 4 registered may be used, even in casual events.
  if (!tournament.isOfficial && !hasMatchTrio(tournament.deckType) && tournament.participants.length > 0 && (tab === "partidas" || tab === "resumo")) {
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
      : hasMatchTrio(tournament.deckType)
        // Composition AS REGISTERED (snapshot), not today's profile.
        ? snapshotOrLive(p, beybladeMap)
        : [p.beyblade1, p.beyblade2, p.beyblade3]
          .filter(Boolean)
          .map((id) => beybladeMap.get(id!))
          .filter(Boolean) as BeybladeInfo[],
  }));

  // Judge candidates for official tournaments: the registered participants plus
  // every admin (an admin can judge even without competing). Only fetched/built
  // when the admin is about to start the tournament.
  const showStartButton =
    isAdminUser &&
    tournament.status === "REGISTRATION" &&
    participantCount >= 2;

  type JudgeCandidate = { id: string; name: string; isAdmin: boolean; isParticipant: boolean };
  let judgeCandidates: JudgeCandidate[] = [];
  if (showStartButton && tournament.isOfficial) {
    const adminUsers = await prisma.user.findMany({
      where: { role: "ORGANIZER", deleted: false, isGuest: false },
      select: { id: true, name: true, bladerName: true },
      orderBy: { name: "asc" },
    });
    const candidateMap = new Map<string, JudgeCandidate>();
    for (const p of tournament.participants) {
      if (p.user.isGuest) continue;
      candidateMap.set(p.userId, {
        id: p.userId,
        name: p.user.bladerName || p.user.name,
        isAdmin: false,
        isParticipant: true,
      });
    }
    for (const a of adminUsers) {
      const existing = candidateMap.get(a.id);
      if (existing) existing.isAdmin = true;
      else candidateMap.set(a.id, { id: a.id, name: a.bladerName || a.name, isAdmin: true, isParticipant: false });
    }
    judgeCandidates = [...candidateMap.values()];
  }

  // Always the participant's currently selected combo (used by the admin
  // edit-beyblades form, regardless of tournament.isOfficial).
  const currentSelectionMap: Map<string, BeybladeInfo[]> = new Map(
    tournament.participants.map((p) => [
      p.userId,
      hasMatchTrio(tournament.deckType)
        ? snapshotOrLive(p, beybladeMap)
        : [p.beyblade1, p.beyblade2, p.beyblade3]
          .filter(Boolean)
          .map((id) => beybladeMap.get(id!))
          .filter(Boolean) as BeybladeInfo[],
    ])
  );
  const myParticipant = tournament.participants.find((p) => p.userId === session?.user.id);
  const isParticipant = !!myParticipant;
  const myApproved = myParticipant ? ((myParticipant as { approved?: boolean }).approved ?? true) : true;

  const currentParticipant = tournament.participants.find(
    (p) => p.userId === session?.user.id
  );
  const currentBeybladeIds = currentParticipant ? registeredIds(currentParticipant) : [];

  // ── Phases ────────────────────────────────────────────────────────────────
  const isSwiss = isSwissFormat(tournament.format);
  const approvedParticipants = tournament.participants.filter(
    (p) => (p as { approved?: boolean }).approved !== false
  );
  // Suíço: rounds 1..swissRounds are the Swiss phase, later rounds the knockout.
  // Use the count frozen on the tournament (set when round 1 was generated).
  // Recomputing it from today's approved count moved the boundary whenever a
  // player was approved/removed later, which could file knockout rounds under
  // the Swiss phase (and their wins into the Swiss table).
  const swissRounds = isSwiss
    ? tournament.swissRounds ?? Math.max(1, Math.ceil(Math.log2(Math.max(2, approvedParticipants.length))))
    : 0;

  // Plain match rows for the shared standings math (lib/standings).
  const standingsMatches: StandingsMatch[] = tournament.matches.map((m) => ({
    round: m.round,
    status: m.status,
    player1Id: m.player1.id,
    player2Id: m.player2.id,
    winnerId: m.winner?.id ?? null,
    isWalkover: m.isWalkover,
    isThirdPlace: m.isThirdPlace,
    points: m.points,
  }));
  const userById = new Map(tournament.participants.map((p) => [p.userId, p]));
  const nameOf = (userId: string) => {
    const p = userById.get(userId);
    if (p) return playerLabel(p.user, isAdminUser);
    const m = tournament.matches.find((x) => x.player1.id === userId || x.player2.id === userId);
    const u = m ? (m.player1.id === userId ? m.player1 : m.player2) : null;
    return u ? playerLabel(u, isAdminUser) : "—";
  };

  // Group matches by round (the third-place match is shown on its own).
  const thirdPlaceMatch = tournament.matches.find((m) => m.isThirdPlace) ?? null;
  const rounds = new Map<number, typeof tournament.matches>();
  for (const match of tournament.matches) {
    if (match.isThirdPlace) continue;
    if (!rounds.has(match.round)) rounds.set(match.round, []);
    rounds.get(match.round)!.push(match);
  }
  const sortedRounds = Array.from(rounds.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([round, roundMatches]) => [
      round,
      [...roundMatches].sort((a, b) => (a.bracketPos ?? 0) - (b.bracketPos ?? 0)),
    ] as [number, typeof tournament.matches]);

  const swissRoundsList = isSwiss ? sortedRounds.filter(([r]) => r <= swissRounds) : [];
  const knockoutRoundsList = isSwiss ? sortedRounds.filter(([r]) => r > swissRounds) : [];
  const hasKnockout = knockoutRoundsList.length > 0;
  // Last knockout round, from the size of the first knockout round — so the
  // semifinal isn't called "Final" before the final exists.
  const firstKo = knockoutRoundsList[0]?.[1] ?? [];
  const koPlayers = new Set(firstKo.flatMap((m) => [m.player1.id, m.player2.id])).size;
  const knockoutLastRound = hasKnockout ? swissRounds + Math.max(1, Math.ceil(Math.log2(Math.max(2, koPlayers)))) : 0;

  // Single elimination: total rounds from the field size (stable names).
  let bracketSize = 1;
  while (bracketSize < tournament.participants.length) bracketSize *= 2;
  const totalBracketRounds = Math.max(1, Math.log2(bracketSize));

  const roundLabel = (round: number) =>
    isSwiss
      ? round <= swissRounds
        ? `Suíço · Rodada ${round}`
        : getRoundName(round, knockoutLastRound, "SINGLE_ELIMINATION")
      : tournament.format === "SINGLE_ELIMINATION"
        ? getRoundName(round, totalBracketRounds, "SINGLE_ELIMINATION")
        : `Rodada ${round}`;
  const byeText = isSwiss
    ? "Folga nesta rodada (bye): conta 1 ponto no suíço, sem pontos de batalha."
    : "Avança direto para a próxima fase (bye), sem jogar.";

  // ── Standings ─────────────────────────────────────────────────────────────
  // a) Swiss phase table: Swiss rounds ONLY (knockout never counts here).
  const knockoutPlayers = new Set(
    isSwiss
      ? tournament.matches.filter((m) => m.round > swissRounds && m.player1.id !== m.player2.id).flatMap((m) => [m.player1.id, m.player2.id])
      : []
  );
  // Nicknames for the alphabetical tiebreak (same rule as the engine).
  const nickOf = new Map(tournament.participants.map((p) => [p.userId, p.user.bladerName || p.user.name]));
  const swissRows = isSwiss
    ? computeSwissStandings(approvedParticipants.map((p) => p.userId), standingsMatches, swissRounds, nickOf)
    : [];
  // A player listed as qualified below a non-qualified one: the bracket was
  // seeded by an older/undefined tiebreak on a complete tie.
  const seedingMismatch = isSwiss && knockoutPlayers.size > 0 && swissRows.some((r, i) =>
    !knockoutPlayers.has(r.userId) && swissRows.slice(i + 1).some((x) => knockoutPlayers.has(x.userId))
  );
  const qualifiersCount = tournament.qualifiers ?? 0;
  // Knockout match rules (own rules, or the main ones on old events).
  const knockout = knockoutRules(tournament);

  // Whole-event tallies for the other formats and the "all matches" stats.
  const battlePointsMap = new Map<string, number>();
  const conceded = new Map<string, number>();
  for (const m of tournament.matches) {
    if (m.status !== "FINISHED" || m.player1.id === m.player2.id) continue;
    const p1Pts = m.points.filter((p) => p.userId === m.player1.id).reduce((s, p) => s + p.points, 0);
    const p2Pts = m.points.filter((p) => p.userId === m.player2.id).reduce((s, p) => s + p.points, 0);
    battlePointsMap.set(m.player1.id, (battlePointsMap.get(m.player1.id) ?? 0) + p1Pts);
    battlePointsMap.set(m.player2.id, (battlePointsMap.get(m.player2.id) ?? 0) + p2Pts);
    conceded.set(m.player1.id, (conceded.get(m.player1.id) ?? 0) + p2Pts);
    conceded.set(m.player2.id, (conceded.get(m.player2.id) ?? 0) + p1Pts);
  }
  const diffOf = (id: string) => (battlePointsMap.get(id) ?? 0) - (conceded.get(id) ?? 0);
  const pointsCompare = (a: typeof tournament.participants[number], b: typeof tournament.participants[number]) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    const bp = (battlePointsMap.get(b.userId) ?? 0) - (battlePointsMap.get(a.userId) ?? 0);
    if (bp !== 0) return bp;
    const d = diffOf(b.userId) - diffOf(a.userId);
    if (d !== 0) return d;
    // Explicit final tiebreak (never the database order): nickname, then id.
    return (nickOf.get(a.userId) ?? "").localeCompare(nickOf.get(b.userId) ?? "", "pt-BR") || (a.userId < b.userId ? -1 : 1);
  };

  // b) Final placement.
  type PlaceRow = { userId: string; place: number; note: string };
  let finalPlacement: PlaceRow[] = [];
  let finalIsOfficial = false; // true = the stored result written when the event closed
  const allPlaced = approvedParticipants.length > 0 && approvedParticipants.every((p) => p.placement != null);
  // The current rule applied to the current results (Swiss events).
  const recalculated = isSwiss
    ? computeSwissFinalPlacement(approvedParticipants.map((p) => p.userId), standingsMatches, swissRounds, nickOf)
    : [];
  // Saved placements differing from that recalculation (kept as historical).
  let divergences: PlacementDivergence[] = [];
  if (tournament.status === "FINISHED" && allPlaced) {
    finalIsOfficial = true;
    finalPlacement = [...approvedParticipants]
      .sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0))
      .map((p) => ({ userId: p.userId, place: p.placement!, note: "" }));
    if (isSwiss) {
      divergences = comparePlacements(
        approvedParticipants.map((p) => ({ userId: p.userId, placement: p.placement })),
        recalculated,
        swissRows
      );
    }
  } else if (isSwiss && hasKnockout) {
    finalPlacement = recalculated.map((x) => ({ userId: x.userId, place: x.place, note: "" }));
  } else if (tournament.format === "SINGLE_ELIMINATION" && sortedRounds.length > 0) {
    const elimRound = new Map<string, number>();
    for (const m of tournament.matches) {
      if (m.player1.id === m.player2.id || !m.winner || m.status !== "FINISHED" || m.isThirdPlace) continue;
      elimRound.set(m.winner.id === m.player1.id ? m.player2.id : m.player1.id, m.round);
    }
    const third = tournament.matches.find((m) => m.isThirdPlace && m.winner);
    finalPlacement = [...approvedParticipants].sort((a, b) => {
      const aE = elimRound.get(a.userId) ?? Infinity, bE = elimRound.get(b.userId) ?? Infinity;
      if (bE !== aE) return bE - aE;
      if (third?.winner?.id === a.userId && third.winner.id !== b.userId) return -1;
      if (third?.winner?.id === b.userId && third.winner.id !== a.userId) return 1;
      return pointsCompare(a, b);
    }).map((p, i) => ({ userId: p.userId, place: i + 1, note: "" }));
  }
  // How each player's final place was decided (deepest knockout round reached).
  const koDeepest = new Map<string, number>();
  for (const m of tournament.matches) {
    if (m.player1.id === m.player2.id || m.isThirdPlace) continue;
    const isKo = isSwiss ? m.round > swissRounds : tournament.format === "SINGLE_ELIMINATION";
    if (!isKo) continue;
    for (const id of [m.player1.id, m.player2.id]) koDeepest.set(id, Math.max(koDeepest.get(id) ?? 0, m.round));
  }
  const championId = isSwiss && hasKnockout ? decidedPodium(standingsMatches, swissRounds).first
    : tournament.format === "SINGLE_ELIMINATION" ? decidedPodium(standingsMatches, 0).first : undefined;
  for (const row of finalPlacement) {
    const deepest = koDeepest.get(row.userId);
    if (deepest != null) {
      const stage = roundLabel(deepest);
      const thirdWinner = thirdPlaceMatch?.status === "FINISHED" ? thirdPlaceMatch.winner?.id : undefined;
      row.note = row.userId === championId ? "Campeão"
        : stage === "Final" ? "Vice-campeão"
        : row.userId === thirdWinner ? "3º lugar (venceu a disputa de 3º)"
        : `Parou em: ${stage}`;
    } else if (isSwiss && hasKnockout) row.note = "Não avançou da fase suíça";
  }

  // Podium: only positions the results actually decide.
  let podium: { first?: string; second?: string; third?: string } = {};
  if (isSwiss && hasKnockout) podium = decidedPodium(standingsMatches, swissRounds);
  else if (tournament.format === "SINGLE_ELIMINATION") podium = decidedPodium(standingsMatches, 0);
  else if (tournament.status === "FINISHED" && finalPlacement.length > 0) {
    podium = { first: finalPlacement[0]?.userId, second: finalPlacement[1]?.userId, third: finalPlacement[2]?.userId };
  } else if (tournament.status === "FINISHED" && isSwiss && swissRows.length > 0) {
    podium = { first: swissRows[0]?.userId, second: swissRows[1]?.userId, third: swissRows[2]?.userId };
  }
  // Single elimination / GROUPS order for the classification tab.
  const otherStandings = [...approvedParticipants].sort(pointsCompare);

  // Current round (in progress): the earliest round with an undecided match.
  const openRounds = tournament.matches
    .filter((m) => m.player1.id !== m.player2.id && m.status !== "FINISHED")
    .map((m) => m.round);
  const currentRound = openRounds.length ? Math.min(...openRounds) : null;

  // Same rule as the join API (lib/registration): status, deadline in the
  // league time zone, and spots (every registration received takes one).
  const reg = registrationState({
    status: tournament.status,
    registrationDeadline: tournament.registrationDeadline,
    maxParticipants: tournament.maxParticipants,
    participantCount,
  });
  const canJoin = !!session && !isParticipant && reg.open;

  // Registration state for upcoming events (display mirrors the join rules).
  const registrationOpen = reg.open;

  // Suíço finals: a qualified player (in the knockout) may swap 1 deck combo once.
  const inKnockout = !!session?.user.id && hasKnockout &&
    tournament.matches.some((m) => m.round > swissRounds && (m.player1.id === session.user.id || m.player2.id === session.user.id));
  const canSwapFinals = isSwiss && tournament.deckType === "THREE_ON_THREE" &&
    tournament.status !== "FINISHED" && inKnockout &&
    !!currentParticipant && !(currentParticipant as { finalsSwapUsed?: boolean }).finalsSwapUsed &&
    currentBeybladeIds.length === 3;

  // Judge kiosk accounts only need the tournament name and the matches.
  const judgeKiosk = kioskViewer;

  // ── Tabs (kept in the URL: ?aba=...) ──────────────────────────────────────
  const TABS: { key: TabKey; label: string }[] = [
    { key: "resumo", label: "Resumo" },
    { key: "classificacao", label: "Classificação" },
    { key: "partidas", label: "Partidas" },
    { key: "regras", label: "Regras" },
  ];

  // Admin match editor data: all non-bye matches
  const adminMatchRows = tournament.matches
    .filter((m) => m.player1.id !== m.player2.id)
    .map((m) => {
      const p1Points = m.points.filter((p) => p.userId === m.player1.id).reduce((s, p) => s + p.points, 0);
      const p2Points = m.points.filter((p) => p.userId === m.player2.id).reduce((s, p) => s + p.points, 0);
      const p1Sets = m.sets.filter((s) => s.winnerId === m.player1.id).length;
      const p2Sets = m.sets.filter((s) => s.winnerId === m.player2.id).length;
      return {
        id: m.id,
        round: m.round,
        player1Name: playerLabel(m.player1, true),
        player2Name: playerLabel(m.player2, true),
        player1Id: m.player1.id,
        player2Id: m.player2.id,
        status: m.status,
        isWalkover: m.isWalkover,
        winnerId: m.winner?.id ?? null,
        p1Sets, p2Sets, p1Points, p2Points,
        sets: [...m.sets]
          .sort((a, b) => a.setNumber - b.setNumber)
          .map((s) => ({ p1Points: s.player1Points, p2Points: s.player2Points })),
      };
    });

  // Group participants by group (for GROUPS format)
  const groupMap = new Map<string, { group: { id: string; name: string }; participants: typeof tournament.participants }>();
  if (tournament.format === "GROUPS") {
    for (const p of tournament.participants) {
      if (p.group) {
        if (!groupMap.has(p.group.id)) groupMap.set(p.group.id, { group: p.group, participants: [] });
        groupMap.get(p.group.id)!.participants.push(p);
      }
    }
  }

  const community = communityOf(tournament.communitySlug);
  // Integrity of the Swiss records (pure, read-only): conflicts are shown,
  // never hidden, and the recalculated table is not presented as certified.
  const integrity = isSwiss
    ? auditSwiss({
        matches: tournament.matches.map((m) => ({ id: m.id, round: m.round, status: m.status, player1Id: m.player1.id, player2Id: m.player2.id, winnerId: m.winner?.id ?? null, isWalkover: m.isWalkover, isThirdPlace: m.isThirdPlace, arena: m.arena, slot: m.slot })),
        swissRounds,
        participants: approvedParticipants.map((p) => p.userId),
        tournamentStatus: tournament.status,
        qualifiers: tournament.qualifiers,
      })
    : [];
  const blockingIssues = integrity.filter((i) => i.severity === "bloqueante");
  const flagged = new Map<string, string>();
  for (const it of integrity) {
    if (it.severity !== "bloqueante" && it.code !== "SCHEDULE_COLLISION") continue;
    for (const id of it.matchIds) if (!flagged.has(id)) flagged.set(id, it.code === "SCHEDULE_COLLISION" ? "Conflito de agenda" : `${it.message}${it.userId ? ` (${nameOf(it.userId)})` : ""}`);
  }
  const integrityBanner = integrity.length > 0 && (blockingIssues.length > 0 || isAdminUser) && (
    <section role="alert" aria-labelledby="integridade-titulo" className="rounded-xl border border-warn/50 bg-warn-bg p-4">
      <h3 id="integridade-titulo" className="font-bold text-warn">
        {blockingIssues.length ? "Registros inconsistentes nesta fase" : "Avisos de integridade"}
      </h3>
      <p className="mt-1 text-sm text-gray-100">
        {blockingIssues.length
          ? "Há partidas que contam duas vezes para o mesmo jogador ou registros inválidos. A classificação recalculada abaixo NÃO é certificada; avanço, mata-mata e encerramento ficam bloqueados até a organização resolver."
          : "Itens para conferência da organização (não bloqueiam o torneio)."}
        {tournament.status === "FINISHED" && " A colocação oficial registrada no encerramento é mantida."}
      </p>
      {isAdminUser && (
        <ul className="mt-2 space-y-1 text-sm text-gray-200 list-disc pl-5">
          {integrity.slice(0, 30).map((it, i) => (
            <li key={i}>
              [{it.severity}] {it.message}{it.userId ? ` Jogador: ${nameOf(it.userId)}.` : ""}{it.matchIds.length ? ` IDs: ${it.matchIds.join(", ")}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const matchCardProps = {
    isOrganizer: canJudge,
    isAdmin: isAdminUser,
    tournamentId: tournament.id,
    participantBeyblades,
    arenaCount: tournament.arenas ?? 1,
    currentUserId: session?.user.id,
    deckType: tournament.deckType,
    openJudging,
    canOperate,
    byeText,
    flagged,
  };
  const card = "bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6";

  // One round of matches. Phones: a single column ordered by slot/arena, each
  // card naming its round and arena. Large screens with several arenas: the
  // arena grid (in its own horizontally-scrollable box, never the page).
  const RoundBlock = ({ round, roundMatches }: { round: number; roundMatches: typeof tournament.matches }) => {
    const arenaCount = tournament.arenas ?? 1;
    const useStoredArenas = arenaCount > 1 && roundMatches.some((m) => m.arena != null);
    const byeMatches = roundMatches.filter((m) => m.player1.id === m.player2.id);
    const arenaMatches = roundMatches.filter((m) => m.player1.id !== m.player2.id);
    const ordered = [...arenaMatches].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || (a.arena ?? 0) - (b.arena ?? 0));
    const slots = useStoredArenas ? [...new Set(arenaMatches.map((m) => m.slot ?? 0))].sort((a, b) => a - b) : [];
    const label = roundLabel(round);
    const isCurrent = tournament.status === "IN_PROGRESS" && currentRound === round;
    return (
      <section id={`rodada-${round}`} aria-labelledby={`rodada-${round}-titulo`} className={`${card} scroll-mt-24`}>
        <h3 id={`rodada-${round}-titulo`} className="text-lg font-bold text-white mb-4 flex items-center gap-2 flex-wrap">
          {label}
          {isCurrent && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/40">● Rodada atual</span>}
        </h3>
        <div className={`grid gap-3 sm:grid-cols-2 ${useStoredArenas ? "lg:hidden" : ""}`}>
          {ordered.map((match) => (
            <MatchCard key={match.id} match={match} roundLabel={label} {...matchCardProps} />
          ))}
          {byeMatches.map((match) => (
            <MatchCard key={match.id} match={match} roundLabel={label} {...matchCardProps} />
          ))}
        </div>
        {useStoredArenas && (
          <div className="hidden lg:block overflow-x-auto">
            <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: `repeat(${arenaCount}, minmax(180px, 1fr))` }}>
              {Array.from({ length: arenaCount }, (_, i) => (
                <div key={i} className="text-center text-xs font-bold text-brand-yellow bg-brand-yellow/10 border border-brand-yellow/20 rounded-lg py-1.5">
                  Arena {i + 1}
                </div>
              ))}
            </div>
            {slots.map((slot) => (
              <div key={slot} className="grid gap-3 mb-3" style={{ gridTemplateColumns: `repeat(${arenaCount}, minmax(180px, 1fr))` }}>
                {Array.from({ length: arenaCount }, (_, i) => {
                  // EVERY match of this arena + time slot is rendered: a second
                  // record here is a scheduling conflict, never hidden.
                  const cell = arenaMatches.filter((m) => (m.slot ?? 0) === slot && (m.arena ?? 1) === i + 1);
                  if (cell.length === 0) {
                    return (
                      <div key={i} className="border border-dashed border-gray-800 rounded-lg flex items-center justify-center py-6">
                        <span className="text-gray-500 text-xs">Arena livre</span>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="space-y-2">
                      {cell.length > 1 && (
                        <p role="note" className="rounded-md border border-warn/40 bg-warn-bg px-2 py-1 text-xs font-semibold text-warn">
                          Conflito de agenda: mais de uma partida neste horário e arena
                        </p>
                      )}
                      {cell.map((match) => <MatchCard key={match.id} match={match} roundLabel={label} {...matchCardProps} />)}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Matches whose arena isn't part of the grid are still listed. */}
            <div className="space-y-3">
              {arenaMatches.filter((m) => m.arena == null || m.arena < 1 || m.arena > arenaCount).map((match) => (
                <MatchCard key={match.id} match={match} roundLabel={label} {...matchCardProps} />
              ))}
              {byeMatches.map((match) => (
                <MatchCard key={match.id} match={match} roundLabel={label} {...matchCardProps} />
              ))}
            </div>
          </div>
        )}
      </section>
    );
  };

  // Knockout: a list (default everywhere, the only view on phones) plus the
  // graphic bracket as an alternative on larger screens / on demand, scrolling
  // inside its own box.
  const KnockoutBlock = ({ koRounds, totalRounds, title }: { koRounds: [number, typeof tournament.matches][]; totalRounds: number; title: string }) => (
    <section aria-labelledby="mata-mata-titulo" className={card}>
      <h3 id="mata-mata-titulo" className="text-lg font-bold text-white mb-4">{title}</h3>
      <div className="space-y-5">
        {koRounds.map(([round, ms]) => (
          <div key={round} id={`rodada-${round}`} className="scroll-mt-24">
            <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2 flex-wrap">
              {roundLabel(round)}
              {tournament.status === "IN_PROGRESS" && currentRound === round && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/40">● Rodada atual</span>
              )}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {ms.map((match) => <MatchCard key={match.id} match={match} roundLabel={roundLabel(round)} {...matchCardProps} />)}
            </div>
          </div>
        ))}
        {thirdPlaceMatch && (
          <div>
            <h4 className="text-sm font-bold text-gray-300 mb-2">Disputa de 3º lugar</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <MatchCard match={thirdPlaceMatch} roundLabel="Disputa de 3º lugar" {...matchCardProps} />
            </div>
          </div>
        )}
      </div>
      {koRounds.length > 1 && (
        <details className="mt-5 group">
          <summary className="tap inline-flex items-center gap-2 px-3 rounded-lg text-sm font-bold text-[var(--accent)] cursor-pointer hover:bg-white/5 list-none">
            <span aria-hidden="true" className="group-open:rotate-90 transition-transform">▶</span>
            Ver chave gráfica
          </summary>
          <div className="mt-3 max-w-full overflow-x-auto rounded-lg border border-gray-800 p-3" tabIndex={0} aria-label="Chave do mata-mata (role para os lados)">
            <BracketView
              rounds={koRounds}
              totalRounds={totalRounds}
              labelOf={roundLabel}
              {...matchCardProps}
            />
          </div>
        </details>
      )}
    </section>
  );

  const fmtDate = (d: Date | string | null | undefined, withTime = false) =>
    d
      ? new Date(d).toLocaleString("pt-BR", {
          // Dates are typed in local wall time and stored as-is (UTC), so show them in UTC.
          timeZone: "UTC",
          day: "2-digit", month: "2-digit", year: "numeric",
          ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
        })
      : null;
  const hasTime = (d: Date | string | null | undefined) => !!d && (new Date(d).getUTCHours() !== 0 || new Date(d).getUTCMinutes() !== 0);
  const dateText = tournament.isMultiDay
    ? `Dia 1 (suíço): ${fmtDate(tournament.startDate, hasTime(tournament.startDate)) ?? "a definir"} · Dia 2 (mata-mata): ${fmtDate(tournament.day2Date) ?? "a definir"}`
    : fmtDate(tournament.startDate, hasTime(tournament.startDate)) ?? (tournament.status === "DRAFT" || tournament.status === "REGISTRATION" ? "Data a definir" : null);
  const formatText = `${FORMAT_LABELS[tournament.format] ?? tournament.format}${isSwiss && qualifiersCount ? ` + mata-mata (top ${qualifiersCount})` : ""} · ${tournament.deckType === "SOLO" ? "Solo" : `Deck ${deckLabel(tournament.deckType)}`}`;
  const statusIcon = { DRAFT: "✎", REGISTRATION: "📝", IN_PROGRESS: "●", FINISHED: "✓" }[tournament.status];

  // Player list (read-only) for visitors; admins get the manager.
  const participantsSection = (
    <section aria-labelledby="participantes-titulo" className={card}>
      <h3 id="participantes-titulo" className="text-lg font-bold text-white mb-4">
        Participantes ({participantCount}{tournament.maxParticipants ? ` de ${tournament.maxParticipants}` : ""})
      </h3>
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
            beyblade4: p.beyblade4,
            currentBeyblades: currentSelectionMap.get(p.userId) ?? [],
            hasPaid: p.hasPaid,
            beybladeInspected: p.beybladeInspected,
            approved: (p as { approved?: boolean }).approved ?? true,
          }))}
          allPlayers={allPlayers}
        />
      ) : tournament.participants.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum participante inscrito ainda.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {tournament.participants.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-1.5 min-w-0">
              <span aria-hidden="true" className="w-8 h-8 shrink-0 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-300">
                {(p.user.bladerName || p.user.name)[0]?.toUpperCase()}
              </span>
              <span className="text-sm font-medium text-white break-anywhere min-w-0">
                {playerLabel(p.user, isAdminUser)}
                {p.user.isGuest && <span className="ml-1.5 text-xs text-gray-400">(convidado)</span>}
                {(p as { approved?: boolean }).approved === false && <span className="ml-1.5 text-xs text-amber-300">(aguardando aprovação)</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const podiumSection = (podium.first || tournament.status === "FINISHED") && (
    <section aria-labelledby="podio-titulo" className={card}>
      <h3 id="podio-titulo" className="text-lg font-bold text-white mb-4">
        {tournament.status === "FINISHED" ? "Resultado" : "Pódio até agora"}
      </h3>
      {podium.first ? (
        <ol className="grid gap-3 sm:grid-cols-3">
          {([
            ["first", "🥇", "Campeão", "border-amber-400/60 bg-amber-400/10"],
            ["second", "🥈", "Vice-campeão", "border-gray-400/50 bg-gray-400/10"],
            ["third", "🥉", "3º lugar", "border-orange-400/50 bg-orange-400/10"],
          ] as const).map(([k, medal, label, cls]) => {
            const id = podium[k];
            if (!id) return null;
            return (
              <li key={k} className={`rounded-xl border p-4 ${cls}`}>
                <div className="text-sm font-bold text-gray-200"><span aria-hidden="true">{medal} </span>{label}</div>
                <div className="text-lg font-black text-white mt-1 break-anywhere">{nameOf(id)}</div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-gray-300">
          O torneio foi encerrado sem que as partidas decisivas fossem concluídas, então não há pódio definido.
          Veja a classificação para os resultados registrados.
        </p>
      )}
      {podium.first && !podium.third && tournament.format !== "GROUPS" && (hasKnockout || tournament.format === "SINGLE_ELIMINATION") && (
        <p className="text-xs text-gray-400 mt-3">3º lugar ainda não definido.</p>
      )}
    </section>
  );

  const swissLegend = (
    <dl className="mt-4 grid gap-x-4 gap-y-1 text-xs text-gray-400 sm:grid-cols-2">
      <div><dt className="inline font-bold text-gray-300">Pts suíço</dt> <dd className="inline">— 1 por vitória + 1 por bye, só nas rodadas suíças.</dd></div>
      <div><dt className="inline font-bold text-gray-300">V / D</dt> <dd className="inline">— vitórias e derrotas em partidas jogadas do suíço (W.O. conta).</dd></div>
      <div><dt className="inline font-bold text-gray-300">Bye</dt> <dd className="inline">— rodadas de folga (sem adversário).</dd></div>
      <div><dt className="inline font-bold text-gray-300">Pts batalha</dt> <dd className="inline">— pontos de finish feitos (Spin 1, Over/Burst 2, Xtreme 3). 1º desempate.</dd></div>
      <div><dt className="inline font-bold text-gray-300">Saldo</dt> <dd className="inline">— pontos de batalha feitos − sofridos. 2º desempate.</dd></div>
      <div className="sm:col-span-2"><dt className="inline font-bold text-gray-300">Empate completo</dt> <dd className="inline">— mesmos pontos suíços, pontos de batalha e saldo: ordem alfabética do apelido.</dd></div>
    </dl>
  );

  const swissTable = isSwiss && swissRows.length > 0 && (
    <section aria-labelledby="suico-titulo" className={card}>
      <h3 id="suico-titulo" className="text-lg font-bold text-white mb-1">
        Classificação da fase suíça{blockingIssues.length ? " — não certificada" : ""}
      </h3>
      <p className="text-sm text-gray-400 mb-4">
        Somente as {swissRounds} rodada{swissRounds > 1 ? "s" : ""} suíça{swissRounds > 1 ? "s" : ""}. Partidas do mata-mata não entram nesta tabela.
        {qualifiersCount > 0 && ` Os ${qualifiersCount} primeiros avançam para o mata-mata.`}
        {" "}Ordem: pontos suíços, pontos de batalha, saldo e, em empate completo, ordem alfabética do apelido.
      </p>
      {seedingMismatch && (
        <p role="note" className="mb-4 rounded-lg border border-warn/40 bg-warn-bg p-3 text-sm text-gray-100">
          Um jogador marcado como classificado aparece abaixo de outro que não avançou: o corte do mata-mata foi feito
          num empate completo, antes de existir o desempate alfabético. A marcação “Classificado” mostra quem de fato jogou o mata-mata.
        </p>
      )}
      <div className="overflow-x-auto -mx-1 px-1" tabIndex={0} aria-label="Tabela da fase suíça">
        <table className="w-full text-sm">
          <caption className="sr-only">Classificação da fase suíça</caption>
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-800">
              <th scope="col" className="py-2 pr-2 w-8">#</th>
              <th scope="col" className="py-2 pr-2">Jogador</th>
              <th scope="col" className="py-2 px-1 text-right" title="Pontos suíços">Pts suíço</th>
              <th scope="col" className="py-2 px-1 text-right">V–D</th>
              <th scope="col" className="py-2 px-1 text-right hidden sm:table-cell">Bye</th>
              <th scope="col" className="py-2 px-1 text-right hidden sm:table-cell">Pts batalha</th>
              <th scope="col" className="py-2 pl-1 text-right hidden sm:table-cell">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {swissRows.map((r, i) => {
              const classified = knockoutPlayers.has(r.userId);
              return (
                <tr key={r.userId} className={`border-b border-gray-800/60 ${classified ? "bg-brand-yellow/5" : ""}`}>
                  <td className="py-2 pr-2 font-bold text-gray-300 tabular-nums">{i + 1}</td>
                  <td className="py-2 pr-2">
                    <span className="font-semibold text-white break-anywhere">{nameOf(r.userId)}</span>
                    {classified && <span className="ml-2 text-[11px] font-bold text-amber-300 whitespace-nowrap">✓ Classificado</span>}
                    <span className="sm:hidden block text-xs text-gray-400">
                      {r.byes > 0 && `${r.byes} bye · `}{r.battlePoints} pts batalha · saldo {r.balance > 0 ? "+" : ""}{r.balance}
                    </span>
                  </td>
                  <td className="py-2 px-1 text-right font-black text-amber-300 tabular-nums">{r.swissPoints}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-gray-200 whitespace-nowrap">{r.wins}–{r.losses}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-gray-300 hidden sm:table-cell">{r.byes}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-gray-300 hidden sm:table-cell">{r.battlePoints}</td>
                  <td className="py-2 pl-1 text-right tabular-nums text-gray-300 hidden sm:table-cell">{r.balance > 0 ? "+" : ""}{r.balance}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {swissLegend}
    </section>
  );

  const finalTable = finalPlacement.length > 0 && (
    <section aria-labelledby="final-titulo" className={card}>
      <h3 id="final-titulo" className="text-lg font-bold text-white mb-1">
        {tournament.status === "FINISHED" ? "Colocação final" : "Colocação (parcial)"}
      </h3>
      <p className="text-sm text-gray-400 mb-4">
        {finalIsOfficial
          ? "Resultado registrado no encerramento do torneio. "
          : ""}
        {isSwiss && hasKnockout
          ? divergences.length
            ? "Critério: quem chegou ao mata-mata fica à frente, pela fase em que parou; os demais foram ordenados pela fase suíça na época do encerramento."
            : "Critério: quem chegou ao mata-mata fica à frente, pela fase em que parou; os demais seguem a classificação da fase suíça abaixo."
          : isSwiss
            ? divergences.length
              ? "Critério: classificação da fase suíça na época do encerramento."
              : "Critério: classificação da fase suíça abaixo."
            : tournament.format === "SINGLE_ELIMINATION"
              ? "Critério: fase do chaveamento em que cada jogador parou."
              : "Critério: classificação do torneio."}
        {tournament.status !== "FINISHED" && " Pode mudar até o fim do torneio."}
      </p>
      {divergences.length > 0 && blockingIssues.length === 0 && (
        <div role="note" className="mb-4 rounded-lg border border-warn/40 bg-warn-bg p-3 text-sm text-gray-100">
          <p className="font-bold text-warn">Diferença em relação à tabela da fase suíça</p>
          <p className="mt-1 text-gray-200">
            {divergences.every((d) => d.reason === "empate")
              ? "Estes jogadores estão empatados em tudo na fase suíça (pontos, pontos de batalha e saldo). Quando o torneio foi encerrado, o empate não tinha critério fixo; hoje ele é decidido pela ordem alfabética do apelido. A colocação registrada foi mantida."
              : "Os resultados registrados hoje levam a uma ordem diferente da que foi salva no encerramento (por exemplo, um placar corrigido depois). A colocação registrada foi mantida."}
          </p>
          <ul className="mt-2 space-y-0.5 text-gray-200">
            {divergences.map((d) => (
              <li key={d.userId}>
                <strong className="text-white">{nameOf(d.userId)}</strong>: {d.storedPlace}º registrado · {d.recalculatedPlace}º pela regra atual
                {d.reason === "empate" ? " (empate completo)" : ""}
              </li>
            ))}
          </ul>
          {isAdminUser && (
            <p className="mt-2 text-xs text-gray-300">
              Organizador: para regravar a colocação e os pontos de ranking deste evento com a regra atual, use
              “Recalcular Ranking Final” em Editar Resultados. Isso altera o histórico e os pontos do ranking.
            </p>
          )}
        </div>
      )}
      <ol className="space-y-1.5">
        {finalPlacement.map((row) => {
          const p = userById.get(row.userId);
          const medal = row.place === 1 ? "🥇" : row.place === 2 ? "🥈" : row.place === 3 ? "🥉" : null;
          return (
            <li key={row.userId} className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${row.place <= 3 && podium.first ? "border-amber-400/30 bg-amber-400/5" : "border-gray-800 bg-gray-950"}`}>
              <span className="w-8 shrink-0 text-center font-black text-gray-200 tabular-nums">
                {medal ? <><span aria-hidden="true">{medal}</span><span className="sr-only">{row.place}º</span></> : `${row.place}º`}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-white break-anywhere">{nameOf(row.userId)}</span>
                {row.note && <span className="block text-xs text-gray-400">{row.note}</span>}
              </span>
              {tournament.status === "FINISHED" && tournament.isOfficial && (p?.rankingPoints ?? 0) > 0 && (
                <span className="shrink-0 text-xs font-bold text-amber-300 tabular-nums">+{p!.rankingPoints} ranking</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );

  const generalStats = isSwiss && hasKnockout && (
    <section aria-labelledby="gerais-titulo" className={card}>
      <h3 id="gerais-titulo" className="text-lg font-bold text-white mb-1">Estatísticas gerais</h3>
      <p className="text-sm text-gray-400 mb-4">Todas as partidas jogadas no evento, incluindo o mata-mata (byes não contam).</p>
      <div className="overflow-x-auto" tabIndex={0} aria-label="Estatísticas gerais">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-800">
              <th scope="col" className="py-2 pr-2">Jogador</th>
              <th scope="col" className="py-2 px-1 text-right">Vitórias</th>
              <th scope="col" className="py-2 px-1 text-right">Derrotas</th>
              <th scope="col" className="py-2 pl-1 text-right">Pts batalha</th>
            </tr>
          </thead>
          <tbody>
            {(finalPlacement.length ? finalPlacement.map((r) => r.userId) : swissRows.map((r) => r.userId)).map((id) => {
              const real = tournament.matches.filter((m) => m.status === "FINISHED" && m.player1.id !== m.player2.id && (m.player1.id === id || m.player2.id === id));
              const w = real.filter((m) => m.winner?.id === id).length;
              const l = real.filter((m) => m.winner && m.winner.id !== id).length;
              return (
                <tr key={id} className="border-b border-gray-800/60">
                  <td className="py-2 pr-2 text-white break-anywhere">{nameOf(id)}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-gray-200">{w}</td>
                  <td className="py-2 px-1 text-right tabular-nums text-gray-200">{l}</td>
                  <td className="py-2 pl-1 text-right tabular-nums text-gray-200">{battlePointsMap.get(id) ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  const otherFormatTable = !isSwiss && tournament.format !== "SINGLE_ELIMINATION" && otherStandings.length > 0 && (
    <section aria-labelledby="class-titulo" className={card}>
      <h3 id="class-titulo" className="text-lg font-bold text-white mb-4">Classificação</h3>
      <ol className="space-y-1.5">
        {otherStandings.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 rounded-lg px-3 py-2 border border-gray-800 bg-gray-950">
            <span className="w-8 shrink-0 text-center font-black text-gray-200 tabular-nums">{i + 1}º</span>
            <span className="flex-1 min-w-0 text-sm font-bold text-white break-anywhere">{playerLabel(p.user, isAdminUser)}</span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-bold text-amber-300 tabular-nums">{p.totalPoints} pts</span>
              <span className="block text-xs text-gray-400 tabular-nums">{p.wins} V · {p.losses} D</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-gray-400">Pts = pontos de finish somados nas partidas. V/D = vitórias e derrotas.</p>
    </section>
  );

  const groupsSection = tournament.format === "GROUPS" && groupMap.size > 0 && (
    <section aria-labelledby="grupos-titulo" className={card}>
      <h3 id="grupos-titulo" className="text-lg font-bold text-white mb-4">Grupos</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from(groupMap.values()).map(({ group, participants }) => (
          <div key={group.id}>
            <div className="text-sm font-bold text-amber-300 mb-2">{group.name}</div>
            <ol className="space-y-1">
              {[...participants].sort(pointsCompare).map((p, idx) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 w-5">{idx + 1}.</span>
                  <span className="text-gray-200 flex-1 break-anywhere">{playerLabel(p.user, isAdminUser)}</span>
                  <span className="text-amber-300 font-medium text-xs">{p.totalPoints} pts · {p.wins} V</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );

  // ── Content of each tab ───────────────────────────────────────────────────
  // A finished round whose next step wasn't generated (advance failed or was
  // blocked): visible to organizers, with an idempotent retry.
  const lastRoundNo = sortedRounds.length ? sortedRounds[sortedRounds.length - 1][0] : 0;
  const lastRoundDone = sortedRounds.length > 0 && sortedRounds[sortedRounds.length - 1][1].every((m) => m.status === "FINISHED") && (!thirdPlaceMatch || thirdPlaceMatch.round !== lastRoundNo || thirdPlaceMatch.status === "FINISHED");
  const stalled = tournament.status === "IN_PROGRESS" && lastRoundDone && (isAdminUser || canJudge);
  const stalledBanner = stalled && (
    <section role="alert" className="rounded-xl border border-warn/50 bg-warn-bg p-4">
      <h3 className="font-bold text-warn">A rodada {lastRoundNo} terminou, mas a fase seguinte não foi gerada</h3>
      <p className="mt-1 text-sm text-gray-100">
        {blockingIssues.length
          ? "O avanço está bloqueado por registros inconsistentes (veja o aviso acima)."
          : "O avanço automático falhou ou ainda não rodou. Você pode tentar novamente sem risco de duplicar partidas."}
      </p>
      {isAdminUser && !blockingIssues.length && <RetryAdvanceButton tournamentId={tournament.id} />}
    </section>
  );

  const matchesContent = sortedRounds.length > 0 ? (
    <div className="space-y-6">
      {integrityBanner}
      {stalledBanner}
      {tournament.status === "IN_PROGRESS" && currentRound != null && !judgeKiosk && (
        <a href={`#rodada-${currentRound}`} className="tap inline-flex items-center gap-2 px-4 rounded-lg bg-green-500/15 border border-green-500/40 text-green-200 text-sm font-bold">
          Ir para a rodada atual: {roundLabel(currentRound)}
        </a>
      )}
      {canSwapFinals && (
        <div className="bg-card border border-brand-yellow/40 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-bold text-brand-yellow">Você se classificou! 🎉</div>
            <div className="text-xs text-gray-300 mt-0.5">Pode trocar <b className="text-white">1 combo</b> do seu deck para o mata-mata.</div>
          </div>
          <FinalsDeckButton tournamentId={tournament.id} currentDeckIds={currentBeybladeIds} />
        </div>
      )}
      {tournament.format === "SINGLE_ELIMINATION" ? (
        <KnockoutBlock koRounds={sortedRounds} totalRounds={totalBracketRounds} title="Chaveamento" />
      ) : (
        <>
          {(isSwiss ? swissRoundsList : sortedRounds).map(([round, roundMatches]) => (
            <RoundBlock key={round} round={round} roundMatches={roundMatches} />
          ))}
          {isSwiss && hasKnockout && (
            <KnockoutBlock koRounds={knockoutRoundsList} totalRounds={knockoutLastRound} title="Mata-mata" />
          )}
        </>
      )}
      {isAdminUser && adminMatchRows.length > 0 && !judgeKiosk && (
        <AdminMatchEditor
          matches={adminMatchRows}
          tournamentId={tournament.id}
          participants={approvedParticipants.map((p) => ({ userId: p.userId, name: playerLabel(p.user, isAdminUser) }))}
        />
      )}
    </div>
  ) : tournament.status === "REGISTRATION" || tournament.status === "DRAFT" ? (
    <div className={`${card} text-center`}>
      <h3 className="text-lg font-bold text-white mb-2">As partidas ainda não foram geradas</h3>
      <p className="text-gray-300 text-sm">Elas aparecem aqui quando o organizador iniciar o torneio.</p>
      {isOrganizerOfThis && participantCount < 2 && (
        <p className="text-amber-300 text-sm mt-2">São necessários pelo menos 2 participantes para iniciar.</p>
      )}
    </div>
  ) : (
    <div className={`${card} text-center`}>
      <p className="text-gray-300">Nenhuma partida registrada neste torneio.</p>
    </div>
  );

  const classificationContent = (
    <div className="space-y-6">
      {integrityBanner}
      {finalTable}
      {swissTable}
      {generalStats}
      {otherFormatTable}
      {groupsSection}
      {!finalTable && !swissTable && !otherFormatTable && !groupsSection && (
        <div className={`${card} text-center`}>
          <p className="text-gray-300">A classificação aparece quando as primeiras partidas forem concluídas.</p>
        </div>
      )}
    </div>
  );

  const rulesContent = (
    <div className="space-y-6">
      <section aria-labelledby="formato-titulo" className={card}>
        <h3 id="formato-titulo" className="text-lg font-bold text-white mb-3">Formato e pontuação</h3>
        <ul className="space-y-2 text-sm text-gray-200 list-disc pl-5">
          <li>Formato: {formatText}.</li>
          {hasMatchTrio(tournament.deckType) && (
            <>
              <li>Deck 3 on 3 + 1 reserva: cada participante inscreve 4 Beyblades e escolhe 3 antes de cada confronto; a 4ª fica como reserva. O trio é bloqueado quando o confronto começa e vale para todos os sets dele; no confronto seguinte pode ser outro.</li>
              {tournament.isOfficial && <li>{PLUS_ONE_PARTS_RULE}</li>}
            </>
          )}
          {isSwiss && (
            <li>
              Fase suíça{tournament.swissRounds ? ` de ${swissRounds} rodadas` : ""}: cada vitória vale 1 ponto suíço; quem fica de folga (bye) também recebe 1 ponto.
              Desempate por pontos de batalha e depois saldo.
              {qualifiersCount > 0 && ` Os ${qualifiersCount} primeiros disputam o mata-mata.`}
            </li>
          )}
          <li>
            {isSwiss && qualifiersCount > 0 ? "Fase suíça" : "Partidas"}: {setsLabel(tournament.setsToWin)}, {tournament.pointsToWinSet} pontos para vencer o set.
            {isSwiss && qualifiersCount > 0 && ` Mata-mata (inclui final e 3º lugar): ${setsLabel(knockout.setsToWin)}, ${knockout.pointsToWinSet} pontos para vencer o set.`}
          </li>
          <li>Pontos de finish: Spin 1 · Over 2 · Burst 2 · Xtreme 3 · Misslaunch do adversário 1.</li>
          {!tournament.isOfficial && <li>BeyEncontro: estatísticas de beyblade são registradas, mas os pontos não contam no ranking da comunidade.</li>}
          {tournament.isPartnership && <li>Evento de parceria: conta somente no ranking compartilhado.</li>}
        </ul>
      </section>
      {tournament.regulation ? (
        <section aria-labelledby="regulamento-titulo" className={card}>
          <h3 id="regulamento-titulo" className="text-lg font-bold text-white mb-3">Regulamento</h3>
          <ExpandableText
            collapsible={isLongText(tournament.regulation, 900, 16)}
            moreLabel="Ver regulamento completo"
            lessLabel="Recolher regulamento"
            collapsedClass="max-h-72"
          >
            <RichText text={tournament.regulation} className="text-sm text-gray-200 leading-relaxed" />
          </ExpandableText>
        </section>
      ) : (
        <p className="text-sm text-gray-400">O organizador não publicou um regulamento próprio para este evento.</p>
      )}
    </div>
  );

  const infoList = (
    <dl className="grid gap-3 sm:grid-cols-2 text-sm">
      {dateText && (
        <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Data{hasTime(tournament.startDate) ? " e horário" : ""}</dt><dd className="text-white font-semibold mt-0.5">{dateText}</dd></div>
      )}
      {(tournament.venueName || tournament.address || tournament.location) && (
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Local</dt>
          <dd className="text-white font-semibold mt-0.5 break-anywhere">
            {tournament.venueName ?? tournament.location}
            {tournament.address && <span className="block text-gray-300 font-normal">{tournament.address}</span>}
            {tournament.venueName && tournament.location && <span className="block text-gray-300 font-normal">{tournament.location}</span>}
          </dd>
        </div>
      )}
      <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Formato</dt><dd className="text-white font-semibold mt-0.5">{formatText}</dd></div>
      {tournament.entryFee != null && (
        <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Taxa de inscrição</dt><dd className="text-white font-semibold mt-0.5">{tournament.entryFee > 0 ? `R$ ${tournament.entryFee.toFixed(2).replace(".", ",")}` : "Gratuita"}</dd></div>
      )}
      {tournament.prize && (
        <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Premiação</dt><dd className="text-white font-semibold mt-0.5 break-anywhere">{tournament.prize}</dd></div>
      )}
      <div><dt className="text-xs font-bold uppercase tracking-wide text-gray-400">Organização</dt><dd className="text-white font-semibold mt-0.5 break-anywhere">{tournament.organizer.name} · {community.name}</dd></div>
    </dl>
  );

  const registrationCard = (tournament.status === "REGISTRATION" || tournament.status === "DRAFT") && (
    <section id="inscricao" aria-labelledby="inscricao-titulo" className={`${card} ${registrationOpen ? "border-amber-400/40" : ""}`}>
      <h3 id="inscricao-titulo" className="text-lg font-bold text-white mb-1">
        {registrationOpen ? "Inscrições abertas" : reg.message}
      </h3>
      <p className="text-sm text-gray-300 mb-4">
        {tournament.status === "DRAFT"
          ? "O organizador ainda está preparando o evento."
          : registrationOpen
            ? `${tournament.registrationDeadline ? `Até ${fmtDate(tournament.registrationDeadline, true)} (horário de Brasília). ` : ""}${reg.spotsLeft != null ? `${reg.spotsLeft} vaga(s) restante(s).` : "Sem limite de vagas."}`
            : reg.code === "FULL" ? "Todas as vagas foram preenchidas." : reg.code === "DEADLINE" ? "O prazo de inscrição terminou." : "As inscrições não estão abertas."}
      </p>
      {registrationOpen && (
        canJoin ? (
          <ClientJoinButton tournamentId={tournament.id} deckType={tournament.deckType} isOfficial={tournament.isOfficial} />
        ) : !session ? (
          <Link
            href={authUrl(`/tournaments/${tournament.id}?aba=resumo#inscricao`)}
            className="tap inline-flex items-center justify-center px-5 rounded-lg bg-brand-red hover:bg-brand-red-hover text-white font-bold"
          >
            Entrar para se inscrever
          </Link>
        ) : null
      )}
      {isParticipant && tournament.status === "REGISTRATION" && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          {myApproved ? (
            <span role="status" className="text-sm bg-success-bg text-success border border-success/40 px-4 py-2 rounded-lg font-medium">
              ✓ Inscrição confirmada. Próximo passo: confira seus combos — dá para trocar até o torneio começar.
            </span>
          ) : (
            <span role="status" className="text-sm bg-amber-500/15 text-amber-300 border border-amber-500/30 px-4 py-2 rounded-lg font-medium">⏳ Aguardando aprovação: sua inscrição será confirmada depois que a organização aprovar o pagamento.</span>
          )}
          <EditBeybladesButton tournamentId={tournament.id} deckType={tournament.deckType} currentBeybladeIds={currentBeybladeIds} />
        </div>
      )}
    </section>
  );

  const progressCard = tournament.status === "IN_PROGRESS" && (
    <section aria-labelledby="andamento-titulo" className={card}>
      <h3 id="andamento-titulo" className="text-lg font-bold text-white mb-1">
        {currentRound != null ? `Rodada atual: ${roundLabel(currentRound)}` : "Aguardando a próxima rodada"}
      </h3>
      <p className="text-sm text-gray-300">
        {tournament.matches.filter((m) => m.player1.id !== m.player2.id && m.status === "FINISHED").length} de{" "}
        {tournament.matches.filter((m) => m.player1.id !== m.player2.id).length} partidas concluídas.
        Esta página se atualiza sozinha quando um resultado é registrado.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="?aba=partidas" scroll={false} className="tap inline-flex items-center px-4 rounded-lg bg-brand-red hover:bg-brand-red-hover text-white text-sm font-bold">Ver partidas</Link>
        <Link href="?aba=classificacao" scroll={false} className="tap inline-flex items-center px-4 rounded-lg border border-gray-700 text-gray-100 text-sm font-bold hover:bg-white/5">Ver classificação</Link>
      </div>
    </section>
  );

  const summaryContent = (
    <div className="space-y-6">
      {podiumSection}
      {registrationCard}
      {progressCard}
      <section aria-labelledby="info-titulo" className={card}>
        <h3 id="info-titulo" className="sr-only">Informações do evento</h3>
        {infoList}
        {tournament.description && (
          <div className="mt-5 pt-5 border-t border-gray-800">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Sobre o evento</h4>
            <ExpandableText
              collapsible={isLongText(tournament.description, 420, 8)}
              moreLabel="Ver descrição completa"
              lessLabel="Recolher descrição"
            >
              <RichText text={tournament.description} className="text-sm text-gray-200 leading-relaxed" />
            </ExpandableText>
          </div>
        )}
        {tournament.regulation && (
          <Link href="?aba=regras" scroll={false} className="tap mt-3 inline-flex items-center px-3 rounded-lg text-sm font-bold text-[var(--accent)] hover:bg-white/5">
            Ver regulamento →
          </Link>
        )}
      </section>
      {participantsSection}
    </div>
  );

  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      {/* Live page: new sign-ups and matches scored by other judges show up
          on their own, no manual refresh. */}
      {(tournament.status === "REGISTRATION" || tournament.status === "IN_PROGRESS") && (
        <AutoRefresh
          url={`/api/tournaments/${tournament.id}/version`}
          intervalMs={tournament.status === "IN_PROGRESS" ? 4000 : 8000}
        />
      )}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {judgeKiosk ? (
          <h1 className="text-2xl font-black text-white mb-5 flex items-center gap-2 flex-wrap break-anywhere">
            {tournament.name}
            {tournament.isTest && !/teste/i.test(tournament.name) && <span className="text-xs font-bold px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-300">TESTE</span>}
          </h1>
        ) : (
          <header className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-4">
            {tournament.bannerUrl && (
              <img src={tournament.bannerUrl} alt="" className="w-full h-32 sm:h-52 object-cover" />
            )}
            <div className="p-4 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <ul className="flex flex-wrap items-center gap-2 mb-3" aria-label="Situação do torneio">
                    <li className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_STYLES[tournament.status]}`}>
                      <span aria-hidden="true">{statusIcon} </span>{STATUS_LABELS[tournament.status]}
                    </li>
                    <li className="text-xs font-bold px-3 py-1 rounded-full border border-gray-700 text-gray-200">
                      {community.name}{tournament.isPartnership ? " · Parceria" : ""}
                    </li>
                    <li className={`text-xs font-bold px-3 py-1 rounded-full ${tournament.isOfficial ? "bg-brand-red/20 text-red-200 border border-brand-red/50" : "bg-blue-500/15 text-blue-200 border border-blue-500/40"}`}>
                      {tournament.isOfficial ? "Oficial" : "BeyEncontro"}
                    </li>
                    {tournament.isTest && <li className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-900/40 text-yellow-300">Teste</li>}
                  </ul>
                  <h1 className="text-2xl sm:text-3xl font-black text-white break-anywhere">{tournament.name}</h1>
                  <p className="mt-2 text-sm text-gray-300 flex flex-wrap gap-x-4 gap-y-1">
                    {dateText && <span><span aria-hidden="true">📅 </span>{dateText}</span>}
                    <span><span aria-hidden="true">👥 </span>{participantCount} participante{participantCount === 1 ? "" : "s"}</span>
                    <span>{formatText}</span>
                  </p>
                  {tournament.status === "FINISHED" && podium.first && (
                    <p className="mt-3 text-base font-bold text-amber-300 break-anywhere">
                      <span aria-hidden="true">🏆 </span>Campeão: {nameOf(podium.first)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch lg:w-56 shrink-0">
                  <ShareButton url={`/tournaments/${tournament.id}`} title={tournament.name} className="tap justify-center px-4" showLabel />
                  {showStartButton && (
                    <StartTournamentButton
                      tournamentId={tournament.id}
                      defaultArenas={tournament.arenas ?? 1}
                      candidates={judgeCandidates}
                      allowJudges={tournament.isOfficial}
                    />
                  )}
                  {canJudge && tournament.status === "IN_PROGRESS" && (
                    <FinishTournamentButton tournamentId={tournament.id} isOfficial={tournament.isOfficial} />
                  )}
                  {isAdminUser && <LaunchVideoButton arenas={tournament.arenas ?? 1} community={tournament.communitySlug} />}
                  {!tournament.isOfficial && tournament.status !== "FINISHED" && (isAdminUser || isOrganizerOfThis) && (
                    <JudgingModeToggle tournamentId={tournament.id} mode={tournament.judgingMode} />
                  )}
                  {isAdminUser && tournament.isTest && testToolsAllowed() && isSwissFormat(tournament.format) && tournament.status !== "FINISHED" && (
                    <AutoplaySwissButton tournamentId={tournament.id} />
                  )}
                  {isAdminUser && tournament.isTest && tournament.status !== "REGISTRATION" && (
                    <ResetTournamentButton tournamentId={tournament.id} />
                  )}
                  {canEditTournament && (
                    <Link href={`/tournaments/${tournament.id}/edit`} className="tap inline-flex items-center justify-center text-sm bg-field hover:bg-hover text-gray-100 font-semibold px-4 rounded-lg">
                      ✏️ Editar
                    </Link>
                  )}
                  {isOrganizerOfThis && tournament.status === "FINISHED" && (
                    <Link href={`/tournaments/${tournament.id}/certificates`} className="tap inline-flex items-center justify-center text-sm bg-brand-yellow hover:bg-amber-400 text-black font-bold px-4 rounded-lg">
                      🏆 Cards de Premiação
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </header>
        )}

        {!judgeKiosk && (
          <nav aria-label="Seções do torneio" className="sticky top-[var(--header-h)] z-20 -mx-4 px-4 py-2 mb-4 bg-app/95 backdrop-blur">
            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TABS.map((t) => (
                <li key={t.key}>
                  <Link
                    href={`?aba=${t.key}`}
                    scroll={false}
                    aria-current={tab === t.key ? "page" : undefined}
                    className={`tap flex items-center justify-center rounded-lg px-2 text-sm font-bold transition-colors ${
                      tab === t.key
                        ? "bg-brand-red text-white"
                        : "bg-gray-900 border border-gray-800 text-gray-200 hover:bg-gray-800"
                    }`}
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="min-w-0">
          {tab === "resumo" && summaryContent}
          {tab === "classificacao" && classificationContent}
          {tab === "partidas" && matchesContent}
          {tab === "regras" && rulesContent}
        </div>
      </main>
    </div>
  );
  } catch (e) {
    // notFound()/redirect() and dynamic-rendering bailouts work by throwing;
    // swallowing them turned a missing tournament into "Erro ao carregar".
    const digest = (e as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE")) throw e;
    console.error("[tournament detail]", e);
    return (
      <div className="min-h-screen bg-app">
        <Navbar />
        <div className="flex items-center justify-center p-8">
          <div className="bg-card border border-line rounded-2xl p-8 max-w-md w-full text-center mt-16">
            <div className="mb-4"><img src="/brand/bey-96.webp" alt="" className="w-10 h-10 object-contain mx-auto" /></div>
            <h1 className="text-xl font-bold text-white mb-2">Não foi possível carregar o torneio</h1>
            <p className="text-gray-300 text-sm mb-6">
              Parece uma falha temporária de conexão — o torneio continua salvo. Tente novamente em instantes.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <RetryButton />
              <Link
                href="/tournaments"
                className="tap inline-flex items-center px-5 rounded-xl font-bold border border-line text-gray-100 hover:bg-field"
              >
                Ver todos os torneios
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
