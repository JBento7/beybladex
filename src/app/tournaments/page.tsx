import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import AutoRefresh from "@/components/AutoRefresh";
import Link from "next/link";
import TournamentList from "./TournamentList";
import { parseStatus, parseLiga } from "@/lib/tournamentFilters";
import RetryButton from "@/components/RetryButton";

export const metadata: Metadata = { title: "Torneios" };

function loadTournaments() {
  return prisma.tournament.findMany({
    where: { isTest: false },
    include: {
      organizer: { select: { id: true, name: true } },
      _count: { select: { participants: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams?: { status?: string; liga?: string; q?: string };
}) {
  const session = await getServerSession(authOptions);

  // Both reads are independent — batch them in a single round-trip. A database
  // failure renders a "try again" state instead of an empty list (an empty list
  // would read as "there are no tournaments").
  let loaded: [Awaited<ReturnType<typeof loadTournaments>>, { tournamentId: string }[]];
  try {
    loaded = await Promise.all([loadTournaments(), session
      ? prisma.tournamentParticipant.findMany({ where: { userId: session.user.id }, select: { tournamentId: true } })
      : Promise.resolve([])]);
  } catch (e) {
    console.error("[tournaments page]", e);
    return (
      <div className="min-h-screen bg-[#0d0d0d]">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-black text-white mb-2">Não foi possível carregar os torneios</h1>
          <p className="text-gray-300 mb-6">Pode ser uma falha temporária de conexão. Seus dados não foram afetados.</p>
          <RetryButton />
        </main>
      </div>
    );
  }
  const [tournaments, participations] = loaded;

  const joinedIds = new Set(participations.map((p) => p.tournamentId));

  const tournamentList = tournaments.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    format: t.format,
    status: t.status,
    isOfficial: t.isOfficial,
    communitySlug: t.communitySlug,
    isPartnership: t.isPartnership,
    prize: t.prize,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    maxParticipants: t.maxParticipants,
    bannerUrl: t.bannerUrl,
    location: t.location,
    entryFee: t.entryFee,
    organizer: { name: t.organizer.name },
    participantCount: t._count.participants,
    isJoined: joinedIds.has(t.id),
    canJoin: !!(
      session &&
      t.status === "REGISTRATION" &&
      !joinedIds.has(t.id) &&
      (!t.maxParticipants || t._count.participants < t.maxParticipants)
    ),
  }));

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <AutoRefresh url="/api/tournaments/version" intervalMs={15000} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-white">Torneios</h1>
            <p className="text-gray-300 mt-1">Próximos eventos, torneios em andamento e resultados anteriores.</p>
          </div>
          {session && (
            <Link
              href="/tournaments/create"
              className="tap inline-flex items-center bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-5 rounded-xl transition-colors"
            >
              + Criar torneio
            </Link>
          )}
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center py-24">
            <div className="mb-4"><img src="/bey-removebg-preview.png" alt="" className="w-10 h-10 object-contain mx-auto" /></div>
            <h2 className="text-2xl font-bold text-white mb-2">Nenhum torneio cadastrado ainda</h2>
            <p className="text-gray-300 mb-6">Quando o primeiro campeonato for criado, ele aparece aqui.</p>
            {session && (
              <Link
                href="/tournaments/create"
                className="bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-6 py-3 rounded-xl transition-colors inline-block"
              >
                Criar Primeiro Torneio
              </Link>
            )}
          </div>
        ) : (
          <TournamentList
            tournaments={tournamentList}
            initialStatus={parseStatus(searchParams?.status)}
            initialLiga={parseLiga(searchParams?.liga)}
            initialQuery={(searchParams?.q ?? "").slice(0, 100)}
          />
        )}
      </main>
    </div>
  );
}
