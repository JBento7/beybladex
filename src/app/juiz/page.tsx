import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import AutoRefresh from "@/components/AutoRefresh";
import { isJudgeAccount, judgeCommunity } from "@/lib/judgeAccount";
import { actorOf } from "@/lib/matchAccess";
import { decideMatchOp } from "@/lib/matchPolicy";
import { matchPhaseLabel } from "@/lib/matchLabel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Juiz" };

// Home of a judge account (docs/JUIZ-TELAO.md). First the matches:
//  - "Minha partida em andamento" (assigned to me, being played),
//  - "Próximas partidas atribuídas a mim",
//  - "Outras partidas que posso arbitrar" (same rule the API enforces —
//    lib/matchPolicy; showing a card never grants anything: the server checks).
// Each card opens that match's scoreboard ("Arbitrar"/"Continuar arbitragem");
// nothing is opened or started automatically. Then the events, in three tabs:
//  - Oficiais: official events of the judge's community (and partnerships)
//  - BeyEncontros: casual events from EVERY community (they're often created
//    without picking a league, so filtering them by community hid them)
//  - Teste: rehearsals from every community
// Events still taking sign-ups are listed greyed out, so a judge can tell
// "not started yet" from "missing".
type Tab = "oficial" | "beyencontro" | "teste";

export default async function JudgeHome(props: { searchParams: Promise<{ aba?: string }> }) {
  const searchParams = await props.searchParams;
  const tab: Tab = searchParams.aba === "teste" ? "teste" : searchParams.aba === "beyencontro" ? "beyencontro" : "oficial";
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/juiz");

  const email = session.user.email;
  const community = isJudgeAccount(email) ? judgeCommunity(email) : session.user.homeCommunity ?? "lbl";

  const all = await prisma.tournament.findMany({
    where: {
      status: { in: ["IN_PROGRESS", "REGISTRATION"] },
      OR: [{ communitySlug: community }, { isPartnership: true }, { isTest: true }, { isOfficial: false }],
    },
    select: { id: true, name: true, status: true, isTest: true, isOfficial: true, isPartnership: true, communitySlug: true, _count: { select: { participants: true } } },
    orderBy: { createdAt: "desc" },
  });
  // ── Matches I can judge in the events of this tab (in progress only) ──
  const actor = actorOf(session);
  const liveIds = all.filter((t) => t.status === "IN_PROGRESS").map((t) => t.id);
  const [matchRows, myEntries] = await Promise.all([
    liveIds.length
      ? prisma.match.findMany({
          where: { tournamentId: { in: liveIds }, status: { in: ["IN_PROGRESS", "PENDING"] } },
          select: {
            id: true, tournamentId: true, status: true, round: true, arena: true, slot: true, judgeId: true, onAirAt: true, isThirdPlace: true,
            player1Id: true, player2Id: true,
            player1: { select: { name: true, bladerName: true } },
            player2: { select: { name: true, bladerName: true } },
            tournament: { select: { name: true, format: true, swissRounds: true, organizerId: true, isOfficial: true, isTest: true, communitySlug: true, isPartnership: true, judgingMode: true } },
          },
          orderBy: [{ round: "asc" }, { slot: "asc" }, { arena: "asc" }, { createdAt: "asc" }],
          take: 300,
        })
      : Promise.resolve([]),
    // Open judging (BeyEncontros): approved participants may score.
    prisma.tournamentParticipant.findMany({ where: { userId: session.user.id, approved: { not: false }, tournamentId: { in: liveIds } }, select: { tournamentId: true } }),
  ]);
  const amParticipant = new Set(myEntries.map((e) => e.tournamentId));
  const me = session.user.id;
  const canScore = (m: (typeof matchRows)[number]) =>
    decideMatchOp(actor, { judgeId: m.judgeId, player1Id: m.player1Id, player2Id: m.player2Id, tournament: m.tournament, actorIsParticipant: amParticipant.has(m.tournamentId) }, "score").allowed;
  const playable = matchRows.filter((m) => m.player1Id !== m.player2Id && canScore(m));
  const onAir = (m: { onAirAt: Date | null }) => !!m.onAirAt && Date.now() - m.onAirAt.getTime() < 25000;
  const myLive = playable.filter((m) => m.judgeId === me && m.status === "IN_PROGRESS");
  const myNext = playable.filter((m) => m.judgeId === me && m.status === "PENDING");
  const others = playable.filter((m) => m.judgeId !== me).sort((a, b) => (a.status === b.status ? 0 : a.status === "IN_PROGRESS" ? -1 : 1));

  const tabOf = (t: (typeof all)[number]): Tab | null =>
    t.isTest ? "teste" : !t.isOfficial ? "beyencontro" : t.communitySlug === community || t.isPartnership ? "oficial" : null;
  const inTab = (k: Tab) => all.filter((t) => tabOf(t) === k);
  const live = (k: Tab) => inTab(k).filter((t) => t.status === "IN_PROGRESS");
  const list = inTab(tab);
  const running = list.filter((t) => t.status === "IN_PROGRESS");
  const waiting = list.filter((t) => t.status === "REGISTRATION");

  const TABS: { key: Tab; label: string; href: string; empty: string }[] = [
    { key: "oficial", label: "Oficiais", href: "/juiz", empty: "Nenhum torneio oficial em andamento agora." },
    { key: "beyencontro", label: "BeyEncontros", href: "/juiz?aba=beyencontro", empty: "Nenhum BeyEncontro em andamento agora." },
    { key: "teste", label: "Teste", href: "/juiz?aba=teste", empty: "Nenhum torneio de teste em andamento." },
  ];
  const current = TABS.find((x) => x.key === tab)!;
  const tabClass = (on: boolean) =>
    `flex-1 text-center py-2.5 px-1 rounded-xl text-sm font-bold transition-colors ${
      on ? "bg-[var(--accent)] text-black" : "bg-card text-gray-400 border border-line"
    }`;
  const tag = (t: (typeof all)[number]) => (
    <>
      {t.communitySlug && t.communitySlug !== community && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-field text-gray-400">{t.communitySlug.toUpperCase()}</span>
      )}
      {t.isTest && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-400">TESTE</span>}
    </>
  );

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <Navbar />
      <AutoRefresh url="/api/tournaments/version" intervalMs={10000} />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <nav className="flex gap-2 mb-5 text-sm" aria-label="Atalhos">
          <a href="#minhas-partidas" className="flex-1 text-center min-h-[44px] inline-flex items-center justify-center rounded-xl border border-line bg-card text-gray-200 font-bold">Minhas partidas</a>
          <a href="#torneios" className="flex-1 text-center min-h-[44px] inline-flex items-center justify-center rounded-xl border border-line bg-card text-gray-200 font-bold">Torneios</a>
        </nav>

        <section id="minhas-partidas" aria-labelledby="minhas-titulo" className="mb-8 scroll-mt-20">
          <h1 id="minhas-titulo" className="text-xl font-bold text-white mb-1">Minhas partidas</h1>
          <p className="text-gray-500 text-sm mb-3">O placar só abre quando você tocar em Arbitrar. Nada começa sozinho.</p>
          {myLive.length + myNext.length === 0 && others.length === 0 ? (
            <div className="text-center text-gray-500 py-8 border border-line rounded-2xl">Nenhuma partida para você arbitrar agora.</div>
          ) : (
            <>
              {myLive.length > 0 && <MatchGroup title="Minha partida em andamento" rows={myLive} me={me} onAir={onAir} highlight />}
              {myNext.length > 0 && <MatchGroup title="Próximas partidas atribuídas a mim" rows={myNext.slice(0, 10)} me={me} onAir={onAir} />}
              {others.length > 0 && <MatchGroup title="Outras partidas que posso arbitrar" rows={others.slice(0, 20)} me={me} onAir={onAir} />}
            </>
          )}
        </section>

        <h2 id="torneios" className="text-xl font-bold text-white mb-1 scroll-mt-20">Torneios em andamento</h2>
        <p className="text-gray-500 text-sm mb-4">Toque em um torneio para abrir os placares.</p>

        <div className="flex gap-2 mb-5">
          {TABS.map((x) => (
            <Link key={x.key} href={x.href} className={tabClass(tab === x.key)}>
              {x.label} ({live(x.key).length})
            </Link>
          ))}
        </div>

        {running.length === 0 ? (
          <div className="text-center text-gray-500 py-12 border border-line rounded-2xl">
            {current.empty}
            <div className="mt-3">
              <Link href={current.href} className="text-[var(--accent)] font-semibold">Atualizar</Link>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {running.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tournaments/${t.id}`}
                  className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-line hover:border-[var(--accent)] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-white font-bold truncate">{t.name}</div>
                    <div className="text-gray-500 text-xs mt-0.5">{t._count.participants} jogadores</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tag(t)}
                    <span className="text-[var(--accent)] text-xl">›</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {waiting.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-bold text-gray-400 mb-1">Ainda não iniciados</h2>
            <p className="text-xs text-gray-600 mb-3">Aparecem acima quando o organizador iniciar.</p>
            <ul className="flex flex-col gap-2">
              {waiting.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-card border border-line opacity-70">
                  <div className="min-w-0">
                    <div className="text-gray-300 font-semibold truncate text-sm">{t.name}</div>
                    <div className="text-gray-600 text-xs mt-0.5">{t._count.participants} inscritos · aguardando início</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">{tag(t)}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

type JudgeMatchRow = {
  id: string; tournamentId: string; status: string; round: number; arena: number | null; judgeId: string | null; onAirAt: Date | null; isThirdPlace: boolean;
  player1: { name: string; bladerName: string | null }; player2: { name: string; bladerName: string | null };
  tournament: { name: string; format: string; swissRounds: number | null };
};

function MatchGroup({ title, rows, me, onAir, highlight = false }: { title: string; rows: JudgeMatchRow[]; me: string; onAir: (m: JudgeMatchRow) => boolean; highlight?: boolean }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-bold text-gray-300 mb-2">{title}</h2>
      <ul className="flex flex-col gap-2">
        {rows.map((m) => {
          const live = m.status === "IN_PROGRESS";
          const otherJudgeOpen = onAir(m) && m.judgeId !== me && m.judgeId !== null;
          const situation = live ? (onAir(m) ? "Em andamento · placar aberto" : "Em andamento") : otherJudgeOpen ? "Placar aberto por outro juiz" : m.judgeId ? "Aguardando chamada" : "Aguardando juiz";
          return (
            <li key={m.id} className={`rounded-2xl border p-3 ${highlight ? "border-[var(--accent)] bg-card" : "border-line bg-card"}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                <span className="font-bold text-gray-200">Arena {m.arena ?? 1}</span>
                <span>·</span>
                <span>{matchPhaseLabel({ format: m.tournament.format, round: m.round, swissRounds: m.tournament.swissRounds, isThirdPlace: m.isThirdPlace })}</span>
                <span>·</span>
                <span className="truncate max-w-[50%]">{m.tournament.name}</span>
              </div>
              <div className="mt-1 text-base font-bold text-white break-words">
                {m.player1.bladerName || m.player1.name} <span className="text-gray-500">×</span> {m.player2.bladerName || m.player2.name}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={`text-xs font-bold ${live ? "text-green-300" : "text-gray-400"}`}>{live ? "● " : "○ "}{situation}</span>
                <Link
                  href={`/tournaments/${m.tournamentId}?aba=partidas&placar=${m.id}`}
                  className="shrink-0 min-h-[44px] inline-flex items-center px-4 rounded-xl bg-brand-red text-white font-bold text-sm"
                >
                  {live && m.judgeId === me ? "Continuar arbitragem" : "Arbitrar"}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
