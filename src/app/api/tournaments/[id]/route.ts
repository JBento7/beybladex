export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
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

    if (!tournament) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(tournament);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH — edit a tournament/BeyEncontro that hasn't started yet.
// Official tournaments: only ORGANIZER-role users (admins) can edit.
// BeyEncontros: the creator or any admin can edit.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
    if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    if (tournament.status !== "DRAFT" && tournament.status !== "REGISTRATION") {
      return NextResponse.json(
        { error: "Só é possível editar antes do início do torneio." },
        { status: 400 }
      );
    }

    const isAdmin = session.user.role === "ORGANIZER";
    const isCreator = session.user.id === tournament.organizerId;

    if (tournament.isOfficial) {
      if (!isAdmin) {
        return NextResponse.json({ error: "Apenas administradores podem editar torneios oficiais." }, { status: 403 });
      }
    } else {
      if (!isAdmin && !isCreator) {
        return NextResponse.json({ error: "Apenas o criador do evento ou um administrador pode editar." }, { status: 403 });
      }
    }

    const { name, description, format, maxParticipants, startDate, deckType, prize, arenas, eventType } =
      await req.json();

    if (!name || !format) {
      return NextResponse.json({ error: "Nome e formato são obrigatórios" }, { status: 400 });
    }

    const data: Record<string, unknown> = {
      name,
      description: description || null,
      format,
      deckType: deckType === "THREE_ON_THREE" ? "THREE_ON_THREE" : "SOLO",
      maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
      startDate: startDate ? new Date(startDate) : null,
      prize: prize || null,
      arenas: arenas ? Math.max(1, parseInt(arenas)) : 1,
    };

    // Only admins can change whether a tournament counts as official.
    if (isAdmin && eventType) {
      data.isOfficial = eventType !== "BEYENCONTRO";
    }

    const updated = await prisma.tournament.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
