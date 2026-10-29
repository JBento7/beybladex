import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getLeagueRanking, RANKING_SCOPES, type RankingScope } from "@/lib/leagueRanking";
import { closedMonths, getMonthlyRanking, monthOptions } from "@/lib/monthlyRanking";
import { addMonths, currentMonth, isMonth, monthLabel, TIEBREAKS } from "@/lib/monthlyRules";
import Navbar from "@/components/Navbar";
import RankingsTable from "./RankingsTable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rankings" };

// LBL and LBM: monthly rankings (lib/monthlyRanking — the same classification
// as the home page). Partnership: the all-time sum of partnership events
// (lib/leagueRanking), unchanged.
const SCOPES = RANKING_SCOPES;
type ScopeKey = RankingScope;

export default async function RankingsPage(props: { searchParams: Promise<{ r?: string; mes?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const scope: ScopeKey = searchParams.r && searchParams.r in SCOPES ? (searchParams.r as ScopeKey) : "lbl";
  const now = currentMonth();
  const month = isMonth(searchParams.mes) && searchParams.mes <= now ? searchParams.mes : now;

  const league = scope === "parceria" ? null : scope;
  const [monthly, options, history, partnership] = await Promise.all([
    league ? getMonthlyRanking(league, month) : null,
    league ? monthOptions(league, now) : [],
    league ? closedMonths(league) : [],
    league ? null : getLeagueRanking("parceria"),
  ]);
  const list = monthly ? monthly.entries : partnership ?? [];
  const href = (k: ScopeKey, m?: string) => (k === "parceria" ? "/rankings?r=parceria" : `/rankings?r=${k}${m ? `&mes=${m}` : ""}`);
  const closed = monthly?.status === "closed";

  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="font-display text-title-1 desk:text-title-1-lg text-fg">Ranking</h1>
          <p className="text-body text-fg-2 mt-1">
            {league ? "Ranking mensal: pontos dos torneios oficiais da liga no mês, com os ajustes da organização." : "Soma dos pontos de ranking em torneios oficiais."}{" "}
            <a href="/regras#ranking" className="underline underline-offset-2 text-fg hover:text-brand-yellow">Como os pontos funcionam</a>
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {(Object.keys(SCOPES) as ScopeKey[]).map((k) => (
              <a
                key={k}
                href={href(k, k !== "parceria" && league ? month : undefined)}
                aria-current={k === scope ? "page" : undefined}
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
            <p className="text-xs text-gray-500 mt-2">Somente torneios em parceria entre LBL e LBM, somados desde o início (não é mensal).</p>
          )}

          {league && monthly && (
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <form method="get" action="/rankings" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="r" value={league} />
                <label className="text-sm text-gray-300">Mês e ano
                  <select name="mes" defaultValue={month} className="block mt-1 bg-field border border-line rounded-lg px-3 py-2 text-white min-h-[44px]">
                    {options.map((m) => <option key={m} value={m}>{monthLabel(m)}{m === now ? " (atual)" : ""}</option>)}
                  </select>
                </label>
                <button type="submit" className="min-h-[44px] px-4 rounded-lg border border-line text-sm font-bold text-gray-200 hover:border-gray-500">Ver</button>
              </form>
              <nav aria-label="Navegar entre meses" className="flex gap-2 text-sm">
                <Link href={href(league, addMonths(month, -1))} className="min-h-[44px] inline-flex items-center px-3 rounded-lg border border-line text-gray-200 hover:border-gray-500">← Anterior</Link>
                {month < now && <Link href={href(league, addMonths(month, 1))} className="min-h-[44px] inline-flex items-center px-3 rounded-lg border border-line text-gray-200 hover:border-gray-500">Próximo →</Link>}
              </nav>
              <span className={`text-sm font-bold px-3 py-1 rounded-full border ${closed ? "border-gray-500 text-gray-200" : "border-green-500/50 text-green-300"}`}>
                {monthLabel(month)} · {closed ? "Encerrado" : "Aberto"}
              </span>
            </div>
          )}
          {league && monthly && (
            <p className="text-xs text-gray-500 mt-2">
              Desempate: {TIEBREAKS[monthly.rules.tiebreak].toLowerCase()}.
              {!closed && month === now && " O ranking zera na virada do mês; os meses anteriores continuam disponíveis."}
            </p>
          )}
        </div>

        {closed && monthly?.champion && (
          <section aria-labelledby="campeao-titulo" className="mb-6 rounded-2xl border-2 border-brand-yellow bg-brand-yellow/10 p-5 flex items-center gap-4">
            <span aria-hidden="true" className="text-4xl">🏆</span>
            <div className="min-w-0">
              <h2 id="campeao-titulo" className="text-sm font-bold uppercase tracking-wide text-brand-yellow">Campeão de {monthLabel(month)}</h2>
              <p className="text-xl font-black text-white break-anywhere">{monthly.champion.name}</p>
              <p className="text-sm text-gray-300">{monthly.champion.points} pontos · ranking encerrado{monthly.closedAt ? ` em ${new Date(monthly.closedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}</p>
            </div>
          </section>
        )}

        <RankingsTable
          list={list.map((r) => ({ ...r, avatarUrl: r.avatarUrl ?? null }))}
          currentUserId={session?.user.id ?? null}
          emptyText={league ? `Ninguém pontuou na ${league.toUpperCase()} em ${monthLabel(month)}.` : undefined}
        />

        {league && (
          <section aria-labelledby="historico-titulo" className="mt-10">
            <h2 id="historico-titulo" className="text-lg font-bold text-white mb-3">Histórico mensal da {league.toUpperCase()}</h2>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum mês encerrado ainda. Os meses anteriores podem ser vistos no seletor acima.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {history.map((h) => (
                  <li key={h.month}>
                    <Link href={href(league, h.month)} className="block rounded-xl border border-line bg-card px-4 py-3 hover:border-gray-500">
                      <span className="block text-sm font-bold text-white first-letter:uppercase">{monthLabel(h.month)}</span>
                      <span className="block text-sm text-gray-300"><span aria-hidden="true">🏆 </span>{h.championName ?? "—"}{h.points != null ? ` · ${h.points} pts` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
