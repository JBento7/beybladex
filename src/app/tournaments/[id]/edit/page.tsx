import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import EditTournamentForm from "./EditTournamentForm";

export const dynamic = "force-dynamic";

export default async function EditTournamentPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      description: true,
      format: true,
      deckType: true,
      maxParticipants: true,
      startDate: true,
      prize: true,
      arenas: true,
      isOfficial: true,
      organizerId: true,
      status: true,
      setsToWin: true,
      pointsToWinSet: true,
      qualifiers: true,
      bannerUrl: true,
      location: true,
      venueName: true,
      address: true,
      entryFee: true,
      regulation: true,
      registrationDeadline: true,
    },
  });

  if (!tournament) notFound();

  if (tournament.status !== "DRAFT" && tournament.status !== "REGISTRATION") {
    redirect(`/tournaments/${tournament.id}`);
  }

  const isAdmin = session.user.role === "ORGANIZER";
  const isCreator = session.user.id === tournament.organizerId;

  const canEdit = tournament.isOfficial ? isAdmin : isAdmin || isCreator;
  if (!canEdit) {
    redirect(`/tournaments/${tournament.id}`);
  }

  return (
    <EditTournamentForm
      tournament={{
        id: tournament.id,
        name: tournament.name,
        description: tournament.description,
        format: tournament.format,
        deckType: tournament.deckType,
        maxParticipants: tournament.maxParticipants,
        startDate: tournament.startDate ? tournament.startDate.toISOString() : null,
        prize: tournament.prize,
        arenas: tournament.arenas,
        isOfficial: tournament.isOfficial,
        setsToWin: tournament.setsToWin,
        pointsToWinSet: tournament.pointsToWinSet,
        qualifiers: tournament.qualifiers,
        bannerUrl: tournament.bannerUrl,
        location: tournament.location,
        venueName: tournament.venueName,
        address: tournament.address,
        entryFee: tournament.entryFee,
        regulation: tournament.regulation,
        registrationDeadline: tournament.registrationDeadline ? tournament.registrationDeadline.toISOString() : null,
      }}
      canChangeEventType={isAdmin}
    />
  );
}
