import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import AutoRefresh from "@/components/AutoRefresh";
import { isJudgeAccount, judgeCommunity } from "@/lib/judgeAccount";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Juiz" };

// Home of a judge account: live events, each opening its scoreboard page
// (where the judge scores the matches). Three tabs:
//  - Oficiais: official events of the judge's community (and partnerships)
//  - BeyEncontros: casual events from EVERY community (they're often created
//    without picking a league, so filtering them by community hid them)
//  - Teste: rehearsals from every community
// Events still taking sign-ups are listed greyed out, so a judge can tell
// "not started yet" from "missing".
type Tab = "oficial" | "beyencontro" | "teste";

export default async function JudgeHome({ searchParams }: { searchParams: { aba?: string } }) {
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
      on ? "bg-[var(--accent)] text-black" : "bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]"
    }`;
  const tag = (t: (typeof all)[number]) => (
    <>
      {t.communitySlug && t.communitySlug !== community && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#252525] text-gray-400">{t.communitySlug.toUpperCase()}</span>
      )}
      {t.isTest && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-400">TESTE</span>}
    </>
  );

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <Navbar />
      <AutoRefresh url="/api/tournaments/version" intervalMs={10000} />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-white mb-1">Torneios em andamento</h1>
        <p className="text-gray-500 text-sm mb-4">Toque em um torneio para abrir os placares.</p>

        <div className="flex gap-2 mb-5">
          {TABS.map((x) => (
            <Link key={x.key} href={x.href} className={tabClass(tab === x.key)}>
              {x.label} ({live(x.key).length})
            </Link>
          ))}
        </div>

        {running.length === 0 ? (
          <div className="text-center text-gray-500 py-12 border border-[#2a2a2a] rounded-2xl">
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
                  className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[var(--accent)] transition-colors"
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
                <li key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#141414] border border-[#222] opacity-70">
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
