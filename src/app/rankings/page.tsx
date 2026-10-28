import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getLeagueRanking, RANKING_SCOPES, type RankingScope } from "@/lib/leagueRanking";
import Navbar from "@/components/Navbar";
import RankingsTable from "./RankingsTable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rankings" };

// Three rankings over the same data, differing only in which tournaments count
// (lib/leagueRanking): each community's own events, or the partnership events.
const SCOPES = RANKING_SCOPES;
type ScopeKey = RankingScope;

export default async function RankingsPage(props: { searchParams: Promise<{ r?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const scope: ScopeKey = searchParams.r && searchParams.r in SCOPES ? (searchParams.r as ScopeKey) : "lbl";

  const list = await getLeagueRanking(scope);

  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="font-display text-title-1 desk:text-title-1-lg text-fg">Ranking</h1>
          <p className="text-body text-fg-2 mt-1">Soma dos pontos de ranking em torneios oficiais. <a href="/regras#ranking" className="underline underline-offset-2 text-fg hover:text-brand-yellow">Como os pontos funcionam</a></p>
          <div className="flex flex-wrap gap-2 mt-4">
            {(Object.keys(SCOPES) as ScopeKey[]).map((k) => (
              <a
                key={k}
                href={`/rankings?r=${k}`}
                className={`text-sm font-bold px-4 py-2 rounded-lg border transition-colors ${
                  k === scope ? "bg-brand-yellow text-black border-brand-yellow" : "border-line text-gray-300 hover:border-gray-500"
                }`}
              >
                {SCOPES[k].logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={SCOPES[k].logo!} alt="" width={20} height={20} decoding="async" className="inline-block w-5 h-5 rounded-full object-cover mr-1.5 align-[-4px]" />
                )}
                {SCOPES[k].label}
              </a>
            ))}
          </div>
          {scope === "parceria" && (
            <p className="text-xs text-gray-500 mt-2">Somente torneios em parceria entre LBL e LBM.</p>
          )}
        </div>

        <RankingsTable list={list.map((r) => ({ ...r, avatarUrl: r.avatarUrl ?? null }))} currentUserId={session?.user.id ?? null} />
      </main>
    </div>
  );
}
