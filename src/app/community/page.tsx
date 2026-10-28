export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { authUrl } from "@/lib/safeRedirect";
import Navbar from "@/components/Navbar";
import { TierBadge } from "@/components/TierBadge";

export const metadata: Metadata = { title: "Comunidade" };
import Link from "next/link";
import { COMMUNITY_LIST, communityOf } from "@/lib/communities";
import { getOfficialBattlePoints } from "@/lib/leagueRanking";

// Tabs: everyone ("geral") or only the members of one league.
const PAGE_SIZE = 30;

export default async function CommunityPage({ searchParams }: { searchParams: { c?: string; pagina?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(authUrl(`/community${searchParams.c ? `?c=${encodeURIComponent(searchParams.c)}` : ""}`));
  const tab = COMMUNITY_LIST.some((c) => c.slug === searchParams.c) ? (searchParams.c as string) : "geral";

  // Beyblades are hidden once an official tournament is in progress, or
  // once registration is open and the tournament starts within 7 days.
  // They become visible again once the tournament finishes.
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const activeOfficialTournament = await prisma.tournament.findFirst({
    where: {
      isOfficial: true,
      OR: [
        { status: "IN_PROGRESS" },
        { status: "REGISTRATION", startDate: { lte: sevenDaysFromNow } },
      ],
    },
    select: { id: true },
  });
  const beybladesHidden = !!activeOfficialTournament;

  const players = await prisma.user.findMany({
    // Arena display accounts (arenaN@lbl.arena) are only scoreboards — hide them.
    where: {
      deleted: false,
      isGuest: false,
      NOT: [{ email: { endsWith: ".arena" } }, { email: { endsWith: ".juiz" } }],
      // Players who never picked a league are LBL (the original community).
      ...(tab === "lbl"
        ? { OR: [{ homeCommunity: "lbl" }, { homeCommunity: null }] }
        : tab !== "geral"
          ? { homeCommunity: tab }
          : {}),
    },
    select: {
      id: true,
      name: true,
      bladerName: true,
      role: true,
      homeCommunity: true,
      _count: { select: { beyblades: { where: { hiddenFromCommunity: false } } } },
    },
    orderBy: { name: "asc" },
  });

  // Career totals summed IN THE DATABASE (it used to load every participation
  // row of every player). Official battle points come from the cached
  // ranking service (public data, invalidated with the ranking).
  const [allAgg, officialAgg, beyAgg, officialBattleByUser] = await Promise.all([
    prisma.tournamentParticipant.groupBy({ by: ["userId"], where: { tournament: { isTest: false } }, _sum: { wins: true, losses: true, totalPoints: true } }),
    prisma.tournamentParticipant.groupBy({ by: ["userId"], where: { tournament: { isTest: false, isOfficial: true } }, _sum: { wins: true, rankingPoints: true } }),
    prisma.tournamentParticipant.groupBy({ by: ["userId"], where: { tournament: { isTest: false, isOfficial: false } }, _sum: { rankingPoints: true } }),
    getOfficialBattlePoints(),
  ]);
  const allBy = new Map(allAgg.map((r) => [r.userId, r._sum]));
  const offBy = new Map(officialAgg.map((r) => [r.userId, r._sum]));
  const beyBy = new Map(beyAgg.map((r) => [r.userId, r._sum]));

  const playersWithStats = players.map((p) => {
    const all = allBy.get(p.id);
    const off = offBy.get(p.id);
    const wins = all?.wins ?? 0;
    const losses = all?.losses ?? 0;
    const officialPoints = off?.rankingPoints ?? 0;
    const beyPoints = beyBy.get(p.id)?.rankingPoints ?? 0;
    const battlePoints = all?.totalPoints ?? 0;
    // Official-only ranking keys, matching the tournament classification:
    // official wins → official battle points scored.
    const officialWins = off?.wins ?? 0;
    const officialBattlePoints = officialBattleByUser[p.id] ?? 0;
    const matches = wins + losses;
    const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
    return { ...p, wins, losses, officialPoints, beyPoints, battlePoints, officialWins, officialBattlePoints, matches, winRate };
  });

  // Same order as the tournament classification and the dashboard ranking:
  // official wins → official battle points scored. (Placement/league points are
  // a separate metric shown on the card, not the ranking driver.)
  playersWithStats.sort((a, b) =>
    b.officialWins - a.officialWins ||
    b.officialBattlePoints - a.officialBattlePoints ||
    a.name.localeCompare(b.name)
  );

  // One page of cards; only that page's beyblade previews (top 3) are read —
  // the card shows a count, never the full collection.
  const pages = Math.max(1, Math.ceil(playersWithStats.length / PAGE_SIZE));
  const pageNo = Math.min(pages, Math.max(1, Math.floor(Number(searchParams.pagina)) || 1));
  const pagePlayers = playersWithStats.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);
  // Avatars can be inline images (tens of KB each): read only this page's.
  const avatars = new Map((await prisma.user.findMany({ where: { id: { in: pagePlayers.map((p) => p.id) } }, select: { id: true, avatarUrl: true } })).map((u) => [u.id, u.avatarUrl]));
  const previews = beybladesHidden || pagePlayers.length === 0 ? [] : await prisma.beyblade.findMany({
    where: { userId: { in: pagePlayers.map((p) => p.id) }, hiddenFromCommunity: false },
    select: { id: true, userId: true, name: true, wins: true, losses: true },
    orderBy: [{ wins: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const previewByUser = new Map<string, typeof previews>();
  for (const b of previews) {
    const list = previewByUser.get(b.userId) ?? [];
    if (list.length < 3) list.push(b);
    previewByUser.set(b.userId, list);
  }
  const pageHref = (n: number) => {
    const qs = new URLSearchParams();
    if (tab !== "geral") qs.set("c", tab);
    if (n > 1) qs.set("pagina", String(n));
    const q = qs.toString();
    return `/community${q ? `?${q}` : ""}`;
  };

  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">
            Comunidade{" "}
            <span style={{ color: tab === "geral" ? "#f0a500" : communityOf(tab).color }}>
              {tab === "geral" ? "LBL + LBM" : communityOf(tab).name}
            </span>
          </h1>
          <p className="text-gray-400 mt-1">Conheça os jogadores e suas Beyblades.</p>
          <p className="text-sm text-gray-400 mt-1">
            Ordem desta lista: vitórias em torneios oficiais e depois pontos de batalha — não é o ranking oficial.{" "}
            <Link href="/rankings" className="underline underline-offset-2 text-gray-200 hover:text-brand-yellow">Ver ranking oficial</Link>
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {[{ slug: "geral", name: "Geral", logo: null as string | null, icon: null as string | null, color: "#f0a500" }, ...COMMUNITY_LIST].map((c) => {
              const active = tab === c.slug;
              return (
                <Link
                  key={c.slug}
                  href={c.slug === "geral" ? "/community" : `/community?c=${c.slug}`}
                  className="text-sm font-bold px-4 py-2 rounded-lg border transition-colors inline-flex items-center gap-1.5"
                  style={active ? { background: c.color, borderColor: c.color, color: "#000" } : { borderColor: "#333", color: "#d1d5db" }}
                >
                  {c.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.icon ?? c.logo} alt="" width={20} height={20} loading="lazy" decoding="async" className="w-5 h-5 rounded-full object-cover" />
                  )}
                  {c.name}
                </Link>
              );
            })}
          </div>
        </div>

        {beybladesHidden && (
          <div className="mb-6 text-sm bg-brand-yellow/10 border border-brand-yellow/30 text-brand-yellow px-4 py-3 rounded-lg font-medium">
            🔒 Há um torneio oficial em curso (inscrições ou em andamento). As beyblades dos jogadores ficam ocultas até o término do torneio.
          </div>
        )}

        {playersWithStats.length === 0 ? (
          <p className="text-gray-500 text-center py-16">Nenhum jogador cadastrado ainda.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {pagePlayers.map((player) => {
              const beyCount = player._count.beyblades;
              const avatarUrl = avatars.get(player.id) ?? null;
              const beyPreview = previewByUser.get(player.id) ?? [];
              return (
              <Link
                key={player.id}
                href={`/community/${player.id}`}
                className="bg-card border border-line hover:border-brand-yellow/40 rounded-2xl p-6 transition-all hover:shadow-lg hover:shadow-brand-yellow/5 group"
              >
                {/* Header */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-brand-yellow/30 flex-shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={player.name} width={56} height={56} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-brand-yellow/20 flex items-center justify-center">
                        <img src="/brand/bey-96.webp" alt="" className="w-5 h-5 object-contain" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white truncate group-hover:text-brand-yellow transition-colors">
                        {player.bladerName || player.name}
                      </span>
                      <TierBadge wins={player.officialWins} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={communityOf(player.homeCommunity).icon}
                        width={20} height={20} loading="lazy" decoding="async"
                        alt={communityOf(player.homeCommunity).name}
                        title={communityOf(player.homeCommunity).fullName}
                        className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                      />
                      {player.role === "ORGANIZER" && (
                        <span className="text-xs bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {beybladesHidden
                        ? "Beyblades ocultas"
                        : `${beyCount} beyblade${beyCount !== 1 ? "s" : ""}`}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="bg-field rounded-lg p-3 text-center">
                    <div className="text-lg font-black text-green-400">{player.wins}</div>
                    <div className="text-xs text-gray-500">Vitórias</div>
                  </div>
                  <div className="bg-field rounded-lg p-3 text-center">
                    <div className="text-lg font-black text-brand-yellow">{player.winRate}%</div>
                    <div className="text-xs text-gray-500">Taxa V.</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  <div className="bg-field rounded-lg p-3 text-center">
                    <div className="text-lg font-black text-blue-400">{player.officialPoints}</div>
                    <div className="text-xs text-gray-500">Pontos Liga</div>
                  </div>
                  <div className="bg-field rounded-lg p-3 text-center">
                    <div className="text-lg font-black text-purple-400">{player.beyPoints}</div>
                    <div className="text-xs text-gray-500">Pts BeyEncontro</div>
                  </div>
                </div>

                {/* Beyblades preview */}
                {beybladesHidden ? (
                  <div className="text-xs text-gray-600 text-center py-2">🔒 Ocultas durante o torneio oficial</div>
                ) : beyCount > 0 ? (
                  <div className="space-y-1.5">
                    {beyPreview.map((bey) => {
                      const t = bey.wins + bey.losses;
                      const wr = t > 0 ? Math.round((bey.wins / t) * 100) : 0;
                      return (
                        <div key={bey.id} className="flex items-center justify-between text-xs bg-field rounded-lg px-3 py-2">
                          <span className="text-gray-300 truncate mr-2 flex items-center gap-1"><img src="/brand/bey-96.webp" alt="" className="w-4 h-4 object-contain inline-block mr-1" />{bey.name}</span>
                          <span className="text-brand-yellow font-semibold flex-shrink-0">{wr}% WR</span>
                        </div>
                      );
                    })}
                    {beyCount > 3 && (
                      <div className="text-xs text-gray-500 text-center pt-1">
                        +{beyCount - 3} mais
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-600 text-center py-2">Nenhuma beyblade cadastrada</div>
                )}
              </Link>
              );
            })}
          </div>
        )}

        {pages > 1 && (
          <nav aria-label="Páginas da comunidade" className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
            {pageNo > 1 && <Link href={pageHref(pageNo - 1)} className="px-4 py-2 rounded-lg border border-line text-gray-200 hover:border-brand-yellow">‹ Anterior</Link>}
            <span className="text-gray-400">Página {pageNo} de {pages} · {playersWithStats.length} jogadores</span>
            {pageNo < pages && <Link href={pageHref(pageNo + 1)} className="px-4 py-2 rounded-lg border border-line text-gray-200 hover:border-brand-yellow">Próxima ›</Link>}
          </nav>
        )}
      </main>
    </div>
  );
}
