import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import { isJudgeAccount, judgeCommunity } from "@/lib/judgeAccount";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Juiz" };

// Home of a judge account: the community's live tournaments, each opening its
// scoreboard page (where the judge scores the matches).
export default async function JudgeHome({ searchParams }: { searchParams: { aba?: string } }) {
  const tab = searchParams.aba === "teste" ? "teste" : "oficial";
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/juiz");

  const email = session.user.email;
  const community = isJudgeAccount(email) ? judgeCommunity(email) : session.user.homeCommunity ?? "lbl";

  const all = await prisma.tournament.findMany({
    where: {
      status: "IN_PROGRESS",
      OR: [{ communitySlug: community }, { isPartnership: true }],
    },
    select: { id: true, name: true, isTest: true, _count: { select: { participants: true } } },
    orderBy: { createdAt: "desc" },
  });
  const official = all.filter((t) => !t.isTest);
  const tests = all.filter((t) => t.isTest);
  const tournaments = tab === "teste" ? tests : official;
  const tabClass = (on: boolean) =>
    `flex-1 text-center py-2 rounded-xl text-sm font-bold transition-colors ${
      on ? "bg-[var(--accent)] text-black" : "bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]"
    }`;

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-white mb-1">Torneios em andamento</h1>
        <p className="text-gray-500 text-sm mb-4">Toque em um torneio para abrir os placares.</p>

        <div className="flex gap-2 mb-5">
          <Link href="/juiz" className={tabClass(tab === "oficial")}>Oficiais ({official.length})</Link>
          <Link href="/juiz?aba=teste" className={tabClass(tab === "teste")}>Teste ({tests.length})</Link>
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center text-gray-500 py-16 border border-[#2a2a2a] rounded-2xl">
 {tab === "teste" ? "Nenhum torneio de teste em andamento." : "Nenhum torneio oficial em andamento agora."}
            <div className="mt-3">
              <Link href={tab === "teste" ? "/juiz?aba=teste" : "/juiz"} className="text-[var(--accent)] font-semibold">Atualizar</Link>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {tournaments.map((t) => (
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
                    {t.isTest && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-400">TESTE</span>}
                    <span className="text-[var(--accent)] text-xl">›</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
