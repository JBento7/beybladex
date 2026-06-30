import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import TournamentList from "./TournamentList";

export const metadata: Metadata = { title: "Torneios" };

export default async function TournamentsPage() {
  const session = await getServerSession(authOptions);

  // Both reads are independent — batch them in a single round-trip
  const [tournaments, participations] = await Promise.all([
    prisma.tournament.findMany({
      where: { isTest: false },
      include: {
        organizer: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    session
      ? prisma.tournamentParticipant.findMany({
          where: { userId: session.user.id },
          select: { tournamentId: true },
        })
      : Promise.resolve([]),
  ]);

  const joinedIds = new Set(participations.map((p) => p.tournamentId));

  const tournamentList = tournaments.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    format: t.format,
    status: t.status,
    isOfficial: t.isOfficial,
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white">Torneios</h1>
            <p className="text-gray-400 mt-1">Encontre e participe de campeonatos ativos</p>
          </div>
          {session && (
            <Link
              href="/tournaments/create"
              className="bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
            >
              + Criar Torneio
            </Link>
          )}
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center py-24">
            <div className="mb-4"><img src="/bey-removebg-preview.png" alt="" className="w-10 h-10 object-contain mx-auto" /></div>
            <h2 className="text-2xl font-bold text-white mb-2">Nenhum Torneio Ainda</h2>
            <p className="text-gray-400 mb-6">Seja o primeiro a criar um campeonato!</p>
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
          <TournamentList tournaments={tournamentList} />
        )}
      </main>
    </div>
  );
}
