import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { BookOpen, Swords, Zap } from "lucide-react";
import { authOptions } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import PageHeader, { SectionTitle } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/States";
import RetryButton from "@/components/RetryButton";
import FeaturedCarousel from "@/components/home/FeaturedCarousel";
import { NoActiveTournament } from "@/components/home/FeaturedTournament";
import QuickAction from "@/components/home/QuickAction";
import RankingPreview from "@/components/home/RankingPreview";
import PodiumSummary from "@/components/home/PodiumSummary";
import { getHomeData, homeLeagueForUser, registeredIn, type HomeData } from "@/lib/homeData";
import { getLeagueStats } from "@/lib/leagueStats";
import { rankingPreview } from "@/lib/rankingMath";
import { monthLabel } from "@/lib/monthlyRules";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "A arena da LBL — Liga Beyblade Londrina" } };

const CHANNEL_URL = process.env.NEXT_PUBLIC_OFFICIAL_CHANNEL_URL;

// Public league panel: next event, shortcuts, ranking and the last podium.
// Works without login; the private dashboard stays at /dashboard.
export default async function HomePage() {
  const session = await getServerSession(authOptions);
  // Arena display accounts go straight to their fullscreen scoreboard.
  if (session && /^arena\d+@/i.test(session.user.email ?? "")) redirect("/arena");

  // Ranking and last-event cards follow the league in the player's profile.
  const league = await homeLeagueForUser(session?.user.id, session?.user.homeCommunity);
  const leagueName = league.toUpperCase();
  let data: HomeData | null = null;
  try {
    data = await getHomeData(league);
  } catch (e) {
    console.error("[home]", e);
  }
  const [registered, stats] = await Promise.all([
    // One query for the signed-in player's registrations in every featured event.
    data?.featured.length ? registeredIn(data.featured.map((e) => e.id), session?.user.id).catch(() => [] as string[]) : Promise.resolve([] as string[]),
    getLeagueStats("lbl"),
  ]);
  const preview = data ? rankingPreview(data.ranking, session?.user.id) : null;
  const signedIn = !!session;

  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <main className="mx-auto max-w-content px-4 md:px-6 desk:px-8 py-6 desk:py-8 space-y-6 desk:space-y-8">
        {/* A. Page header */}
        <PageHeader
          title="A arena da LBL"
          description="Encontros, campeonatos e resultados de Beyblade em Londrina."
        />

        {!data ? (
          <ErrorState title="Não foi possível carregar o painel da liga" actions={<RetryButton />}>
            Pode ser uma falha temporária de conexão. Tente novamente em instantes.
          </ErrorState>
        ) : (
          <>
            {/* B. Active events: carousel (static card for one, notice for none) */}
            {data.featured.length > 0 ? (
              <FeaturedCarousel events={data.featured} registeredIds={registered} />
            ) : (
              <NoActiveTournament channelUrl={CHANNEL_URL} />
            )}

            {/* C. Quick actions */}
            <section aria-labelledby="atalhos-titulo">
              <SectionTitle id="atalhos-titulo" className="mb-4">Ações rápidas</SectionTitle>
              <div className="grid gap-4 desk:gap-6 md:grid-cols-3">
                <QuickAction
                  href="/quick-match"
                  Icon={Zap}
                  title="Partida rápida"
                  description="Use o placar para uma batalha 1 contra 1."
                  note={signedIn ? undefined : "Requer login"}
                />
                <QuickAction
                  href="/tournaments/create"
                  Icon={Swords}
                  title="Criar torneio"
                  description="Organize um encontro ou campeonato."
                  note={signedIn ? undefined : "Requer login"}
                />
                <QuickAction href="/regras" Icon={BookOpen} title="Consultar regras" description="Veja pontuação, formatos e critérios do ranking." />
              </div>
              <p className="mt-3 text-small text-fg-2">
                <Link href="/quick-tournament" className="font-semibold text-fg underline underline-offset-2 hover:text-brand-yellow">
                  Torneio rápido sem cadastro
                </Link>
                {" "}— salvo neste aparelho e sem pontos no ranking.
              </p>
            </section>

            {/* D + E. Ranking (7/12) and last podium (5/12) */}
            {/* Top-aligned, each card as tall as its own content. */}
            <div className="grid gap-4 desk:gap-6 desk:grid-cols-12 items-start">
              <div className="desk:col-span-7">
                <RankingPreview
                  top={preview!.top} me={preview!.me} currentUserId={session?.user.id} league={league}
                  title={`Ranking mensal da ${leagueName} · ${monthLabel(data.month)}`}
                  subtitle="Pontos dos torneios oficiais da liga neste mês. Zera na virada do mês."
                  emptyText="Ainda não há pontos neste mês. O ranking começa no primeiro torneio oficial finalizado."
                  href={`/rankings?r=${league}&mes=${data.month}`}
                />
              </div>
              <div className="desk:col-span-5">
                <PodiumSummary event={data.last} />
              </div>
            </div>
          </>
        )}

        {/* F. About the league */}
        <section aria-labelledby="liga-titulo" className="rounded-card border border-line bg-card p-5 md:p-6">
          <SectionTitle id="liga-titulo">Sobre a LBL</SectionTitle>
          <p className="mt-2 text-body text-fg-2 max-w-3xl">
            A Liga Beyblade Londrina organiza encontros e campeonatos de Beyblade X. Torneios oficiais valem pontos no
            ranking da liga; BeyEncontros são eventos casuais que qualquer pessoa com conta pode criar.
          </p>
          {stats && (stats.finishedEvents > 0 || stats.players > 0) && (
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              {stats.finishedEvents > 0 && (
                <div>
                  <dt className="text-small text-fg-2">Torneios concluídos na LBL</dt>
                  <dd className="font-display text-stat desk:text-stat-lg tabular text-brand-yellow">{stats.finishedEvents}</dd>
                </div>
              )}
              {stats.players > 0 && (
                <div>
                  <dt className="text-small text-fg-2">Bladers com conta que já competiram</dt>
                  <dd className="font-display text-stat desk:text-stat-lg tabular text-brand-yellow">{stats.players}</dd>
                </div>
              )}
            </dl>
          )}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-small">
            <Link href="/regras" className="font-semibold text-fg underline underline-offset-2 hover:text-brand-yellow">Regras da plataforma</Link>
            <Link href="/community" className="font-semibold text-fg underline underline-offset-2 hover:text-brand-yellow">Comunidade</Link>
            <Link href="/tournaments" className="font-semibold text-fg underline underline-offset-2 hover:text-brand-yellow">Todos os torneios</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
