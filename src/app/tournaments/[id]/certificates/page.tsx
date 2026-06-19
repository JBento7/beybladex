export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import CertificatesClient from "./CertificatesClient";

export default async function CertificatesPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") redirect("/dashboard");

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      status: true,
      deckType: true,
      participants: {
        where: { placement: { not: null } },
        orderBy: { placement: "asc" },
        take: 5,
        select: {
          placement: true,
          beyblade1: true,
          beyblade2: true,
          beyblade3: true,
          user: {
            select: {
              id: true,
              name: true,
              bladerName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  if (!tournament) notFound();
  if (tournament.status !== "FINISHED") redirect(`/tournaments/${params.id}`);

  // Collect all beyblade IDs to fetch names
  const beybladeIds = tournament.participants.flatMap((p) =>
    [p.beyblade1, p.beyblade2, p.beyblade3].filter(Boolean) as string[]
  );
  const beyblades = beybladeIds.length
    ? await prisma.beyblade.findMany({
        where: { id: { in: beybladeIds } },
        select: { id: true, name: true, blade: true, ratchet: true, bit: true },
      })
    : [];
  const beybladeMap = Object.fromEntries(beyblades.map((b) => [b.id, b]));

  const placements = tournament.participants.map((p) => ({
    placement: p.placement!,
    playerName: p.user.bladerName || p.user.name,
    avatarUrl: p.user.avatarUrl ?? null,
    beyblades: [p.beyblade1, p.beyblade2, p.beyblade3]
      .filter(Boolean)
      .map((id) => beybladeMap[id!] ?? null)
      .filter(Boolean),
  }));

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <a href={`/tournaments/${tournament.id}`} className="text-gray-500 hover:text-gray-300 text-sm">
            ← Voltar ao torneio
          </a>
          <h1 className="text-2xl font-black text-white mt-2">{tournament.name}</h1>
          <p className="text-gray-400 text-sm mt-1">Cards de Premiação — selecione um card para baixar</p>
        </div>
        <CertificatesClient
          placements={placements}
          tournamentName={tournament.name}
        />
      </main>
    </div>
  );
}
