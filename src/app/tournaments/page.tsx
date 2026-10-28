import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import AutoRefresh from "@/components/AutoRefresh";
import Link from "next/link";
import TournamentList from "./TournamentList";
import { parseStatus, parseLiga } from "@/lib/tournamentFilters";
import { listTournaments } from "@/lib/tournamentList";
import RetryButton from "@/components/RetryButton";
import PageHeader from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Torneios" };

export default async function TournamentsPage(
  props: {
    searchParams?: Promise<{ status?: string; liga?: string; q?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const status = parseStatus(searchParams?.status);
  const liga = parseLiga(searchParams?.liga);
  const q = (searchParams?.q ?? "").slice(0, 100);

  // First page only, filtered in the database (lib/tournamentList). A database
  // failure renders a "try again" state instead of an empty list (an empty
  // list would read as "there are no tournaments").
  let first: Awaited<ReturnType<typeof listTournaments>>;
  try {
    first = await listTournaments({ session, status, liga, q, page: 0 });
  } catch (e) {
    console.error("[tournaments page]", String(e).slice(0, 200));
    return (
      <div className="min-h-screen bg-app">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-black text-white mb-2">Não foi possível carregar os torneios</h1>
          <p className="text-gray-300 mb-6">Pode ser uma falha temporária de conexão. Seus dados não foram afetados.</p>
          <RetryButton />
        </main>
      </div>
    );
  }
  const noTournamentsAtAll = first.counts.todos === 0 && status === "todos" && liga === "todas" && !q.trim();

  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <AutoRefresh url="/api/tournaments/version" intervalMs={15000} />
      <main className="mx-auto max-w-content px-4 md:px-6 desk:px-8 py-6 desk:py-8">
        <div className="mb-6 desk:mb-8">
          <PageHeader
            title="Torneios"
            description="Próximos eventos, torneios em andamento e resultados anteriores."
            actions={session ? <ButtonLink href="/tournaments/create" variant="primary">Criar torneio</ButtonLink> : undefined}
          />
        </div>

        {noTournamentsAtAll ? (
          <div className="text-center py-24">
            <div className="mb-4"><img src="/brand/bey-96.webp" alt="" className="w-10 h-10 object-contain mx-auto" /></div>
            <h2 className="text-2xl font-bold text-white mb-2">Nenhum torneio cadastrado ainda</h2>
            <p className="text-gray-300 mb-6">Quando o primeiro campeonato for criado, ele aparece aqui.</p>
            {session && (
              <Link
                href="/tournaments/create"
                className="bg-brand-red hover:bg-brand-red-hover text-white font-bold px-6 py-3 rounded-xl transition-colors inline-block"
              >
                Criar Primeiro Torneio
              </Link>
            )}
          </div>
        ) : (
          <TournamentList
            initial={first}
            initialStatus={status}
            initialLiga={liga}
            initialQuery={q}
          />
        )}
      </main>
    </div>
  );
}
