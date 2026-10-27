"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ShareButton from "@/components/ShareButton";
import { COMMUNITY_LIST, communityOf } from "@/lib/communities";
import { parseStatus, parseLiga, type StatusFilter } from "@/lib/tournamentFilters";

type Tournament = {
  id: string;
  name: string;
  description: string | null;
  format: string;
  status: string;
  isOfficial: boolean;
  communitySlug: string;
  isPartnership: boolean;
  prize: string | null;
  startDate: string | null;
  maxParticipants: number | null;
  bannerUrl: string | null;
  location: string | null;
  entryFee: number | null;
  organizer: { name: string };
  participantCount: number;
  isJoined: boolean;
  canJoin: boolean;
};

const FORMAT_LABELS: Record<string, string> = {
  ROUND_ROBIN: "Suíço",
  GROUPS: "Grupos",
  SINGLE_ELIMINATION: "Eliminação Simples",
  SWISS: "Suíço",
};

// Status chips: text + icon carry the meaning (color only reinforces it).
const STATUS_STYLES: Record<string, { label: string; icon: string; style: string }> = {
  DRAFT: { label: "Em preparação", icon: "✎", style: "bg-gray-700 text-gray-100" },
  REGISTRATION: { label: "Inscrições abertas", icon: "📝", style: "bg-[#f0a500]/20 text-amber-200 border border-[#f0a500]/40" },
  IN_PROGRESS: { label: "Em andamento", icon: "●", style: "bg-green-500/20 text-green-200 border border-green-500/40" },
  FINISHED: { label: "Finalizado", icon: "✓", style: "bg-gray-700 text-gray-100" },
};

// Status filter, from the real Tournament.status values:
//  - "proximos": hasn't started yet (REGISTRATION + DRAFT) — what the home
//    page's "Próximos campeonatos" button opens;
//  - "inscricoes": only the ones taking sign-ups now (REGISTRATION);
//  - "andamento" (IN_PROGRESS) and "anteriores" (FINISHED).
const STATUS_FILTERS: { key: StatusFilter; label: string; match: (s: string) => boolean }[] = [
  { key: "todos", label: "Todos", match: () => true },
  { key: "proximos", label: "Próximos", match: (s) => s === "REGISTRATION" || s === "DRAFT" },
  { key: "inscricoes", label: "Inscrições abertas", match: (s) => s === "REGISTRATION" },
  { key: "andamento", label: "Em andamento", match: (s) => s === "IN_PROGRESS" },
  { key: "anteriores", label: "Anteriores", match: (s) => s === "FINISHED" },
];
// Display order of the sections when "Todos" is selected.
const SECTIONS: { key: string; label: string; statuses: string[] }[] = [
  { key: "andamento", label: "Em andamento", statuses: ["IN_PROGRESS"] },
  { key: "inscricoes", label: "Inscrições abertas", statuses: ["REGISTRATION"] },
  { key: "preparo", label: "Em preparação", statuses: ["DRAFT"] },
  { key: "anteriores", label: "Anteriores", statuses: ["FINISHED"] },
];

// Optional official channel (WhatsApp/Instagram group...). Only shown when the
// deployment configures it — never a made-up link.
const OFFICIAL_CHANNEL_URL = process.env.NEXT_PUBLIC_OFFICIAL_CHANNEL_URL;
const OFFICIAL_CHANNEL_LABEL = process.env.NEXT_PUBLIC_OFFICIAL_CHANNEL_LABEL || "Acompanhar o canal oficial";

export default function TournamentList({
  tournaments,
  initialStatus = "todos",
  initialLiga = "todas",
  initialQuery = "",
}: {
  tournaments: Tournament[];
  initialStatus?: StatusFilter;
  initialLiga?: string;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  // Community filter: a league's own events plus the partnerships it takes part in.
  const [liga, setLiga] = useState<string>(initialLiga);

  // Keep the filters in the URL (shareable, survive a refresh) without a
  // server round-trip on every keystroke.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const set = (k: string, v: string, def: string) => (v && v !== def ? params.set(k, v) : params.delete(k));
    set("status", status, "todos");
    set("liga", liga, "todas");
    set("q", query.trim(), "");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [status, liga, query]);

  // Search + league (status is applied after, so its counts reflect the others).
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tournaments.filter((t) => {
      if (liga !== "todas" && t.communitySlug !== liga && !t.isPartnership) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.location ?? "").toLowerCase().includes(q) ||
        t.organizer.name.toLowerCase().includes(q)
      );
    });
  }, [tournaments, query, liga]);

  const counts = useMemo(() => {
    const c = {} as Record<StatusFilter, number>;
    for (const f of STATUS_FILTERS) c[f.key] = base.filter((t) => f.match(t.status)).length;
    return c;
  }, [base]);

  const current = STATUS_FILTERS.find((f) => f.key === status)!;
  // Upcoming views: soonest first (undated last); otherwise newest first.
  const filtered = base.filter((t) => current.match(t.status));
  if (status === "proximos" || status === "inscricoes") {
    filtered.sort((a, b) => (a.startDate ? Date.parse(a.startDate) : Infinity) - (b.startDate ? Date.parse(b.startDate) : Infinity));
  }
  const anyFilter = status !== "todos" || liga !== "todas" || query.trim() !== "";
  const clearAll = () => { setStatus("todos"); setLiga("todas"); setQuery(""); };

  const selectCls = "tap w-full bg-[#1a1a1a] border border-[#3a3a3a] focus:border-[#f0a500] rounded-xl px-3 text-white outline-none";

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <label htmlFor="busca-torneios" className="block text-sm font-bold text-gray-200 mb-1.5">Buscar</label>
        <div className="relative">
          <input
            id="busca-torneios"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, local ou organizador"
            autoComplete="off"
            className="tap w-full bg-[#1a1a1a] border border-[#3a3a3a] focus:border-[#f0a500] rounded-xl pl-10 pr-4 text-white outline-none transition-colors"
          />
          <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
        </div>
      </div>

      {/* Phones: two labelled selects (no strip of buttons wider than the screen). */}
      <div className="grid grid-cols-2 gap-3 mb-4 md:hidden">
        <div>
          <label htmlFor="filtro-status" className="block text-sm font-bold text-gray-200 mb-1.5">Situação</label>
          <select id="filtro-status" value={status} onChange={(e) => setStatus(parseStatus(e.target.value))} className={selectCls}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>{f.label} ({counts[f.key]})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filtro-liga" className="block text-sm font-bold text-gray-200 mb-1.5">Liga</label>
          <select id="filtro-liga" value={liga} onChange={(e) => setLiga(parseLiga(e.target.value))} className={selectCls}>
            <option value="todas">Todas as ligas</option>
            {COMMUNITY_LIST.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Larger screens: button groups (they wrap, never scroll sideways). */}
      <div className="hidden md:block space-y-3 mb-4">
        <div role="group" aria-label="Situação" className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <FilterBtn key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>
              {f.label} <span className="opacity-80">({counts[f.key]})</span>
            </FilterBtn>
          ))}
        </div>
        <div role="group" aria-label="Liga" className="flex flex-wrap gap-2">
          <FilterBtn active={liga === "todas"} onClick={() => setLiga("todas")}>Todas as ligas</FilterBtn>
          {COMMUNITY_LIST.map((c) => (
            <FilterBtn key={c.slug} active={liga === c.slug} onClick={() => setLiga(c.slug)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.logo} alt="" className="inline-block w-5 h-5 rounded-full object-cover mr-1.5 align-[-4px]" />
              {c.name}
            </FilterBtn>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6 min-h-[44px]">
        <p className="text-sm text-gray-300" aria-live="polite">
          {filtered.length} torneio{filtered.length === 1 ? "" : "s"}
          {status !== "todos" && <> · <strong className="text-white">{current.label}</strong></>}
          {liga !== "todas" && <> · <strong className="text-white">{communityOf(liga).name}</strong></>}
          {query.trim() && <> · busca “{query.trim()}”</>}
        </p>
        {anyFilter && (
          <button type="button" onClick={clearAll} className="tap px-4 rounded-xl text-sm font-bold bg-[#1a1a1a] hover:bg-[#252525] border border-[#3a3a3a] text-gray-100">
            Limpar filtros
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        status === "proximos" && !query.trim() ? (
          <div className="text-center py-14 px-4 bg-[#141414] border border-[#2a2a2a] rounded-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Ainda não há próximos campeonatos anunciados.</h2>
            <p className="text-gray-300 mb-6">Quando um novo evento for publicado, ele aparece aqui.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => setStatus("anteriores")} className="tap px-5 rounded-xl font-bold bg-[#c8102e] hover:bg-[#a00d24] text-white">
                Ver torneios anteriores
              </button>
              {OFFICIAL_CHANNEL_URL && (
                <a href={OFFICIAL_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="tap inline-flex items-center px-5 rounded-xl font-bold border border-[#3a3a3a] text-gray-100 hover:bg-[#252525]">
                  {OFFICIAL_CHANNEL_LABEL}
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-14 px-4 bg-[#141414] border border-[#2a2a2a] rounded-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Nenhum torneio encontrado com esses filtros.</h2>
            <p className="text-gray-300 mb-6">Tente outra busca, outra liga ou outra situação.</p>
            <button type="button" onClick={clearAll} className="tap px-5 rounded-xl font-bold bg-[#c8102e] hover:bg-[#a00d24] text-white">
              Limpar filtros
            </button>
          </div>
        )
      ) : status === "todos" ? (
        <div className="space-y-10">
          {SECTIONS.map((s) => {
            const list = filtered.filter((t) => s.statuses.includes(t.status));
            if (list.length === 0) return null;
            return (
              <section key={s.key} aria-labelledby={`sec-${s.key}`}>
                <h2 id={`sec-${s.key}`} className="text-sm font-black text-gray-200 uppercase tracking-wider mb-3">
                  {s.label} <span className="text-gray-400 font-bold">({list.length})</span>
                </h2>
                <Grid list={list} />
              </section>
            );
          })}
        </div>
      ) : (
        <Grid list={filtered} />
      )}
    </div>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap px-4 rounded-lg text-sm font-bold transition-colors ${active ? "bg-[#f0a500] text-black" : "bg-[#1a1a1a] text-gray-200 border border-[#3a3a3a] hover:bg-[#252525]"}`}
    >
      {active && <span aria-hidden="true">✓ </span>}
      {children}
    </button>
  );
}

function Grid({ list }: { list: Tournament[] }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {list.map((t) => {
        const status = STATUS_STYLES[t.status];
        const pct = t.maxParticipants ? Math.min(100, Math.round((t.participantCount / t.maxParticipants) * 100)) : null;
        return (
          <div key={t.id} className="bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#f0a500]/30 rounded-2xl overflow-hidden transition-all flex flex-col">
            {t.bannerUrl && <img src={t.bannerUrl} alt="" className="w-full h-32 object-cover" />}
            <div className="p-4 sm:p-6 flex flex-col flex-1 min-w-0">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${status.style}`}><span aria-hidden="true">{status.icon} </span>{status.label}</span>
                  {!t.isOfficial && <span className="text-xs bg-blue-500/20 text-blue-200 border border-blue-500/40 px-2.5 py-1 rounded-full font-semibold">🎮 BeyEncontro</span>}
                  <CommunityBadge slug={t.communitySlug} partnership={t.isPartnership} />
                </div>
                <span className="text-xs text-gray-200 font-medium bg-[#252525] px-2.5 py-1 rounded-full">{FORMAT_LABELS[t.format]}</span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2 break-anywhere">{t.name}</h3>
              {t.description && <p className="text-sm text-gray-300 mb-4 line-clamp-3 break-anywhere whitespace-pre-line">{t.description}</p>}

              <div className="mt-auto">
                {t.prize && <div className="mb-3 text-sm bg-[#f0a500]/10 border border-[#f0a500]/30 text-[#f0a500] px-3 py-2 rounded-lg font-medium">🏆 {t.prize}</div>}
                <div className="flex items-center gap-x-3 gap-y-1 text-sm text-gray-300 mb-2 flex-wrap break-anywhere">
                  <span>🎯 {t.organizer.name}</span>
                  {t.location && <span>📍 {t.location}</span>}
                  {t.entryFee !== null && <span className="text-green-300">💵 {t.entryFee > 0 ? `R$ ${t.entryFee.toFixed(2).replace(".", ",")}` : "Gratuito"}</span>}
                </div>
                {t.startDate ? (
                  <div className="text-sm text-gray-300 mb-3"><span aria-hidden="true">📅 </span>{new Date(t.startDate).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                ) : (t.status === "DRAFT" || t.status === "REGISTRATION") && (
                  <div className="text-sm text-gray-300 mb-3"><span aria-hidden="true">📅 </span>Data a definir</div>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-300 mb-1">
                  <span><span aria-hidden="true">👥 </span>{t.participantCount}{t.maxParticipants ? ` de ${t.maxParticipants}` : ""} inscrito{t.participantCount === 1 ? "" : "s"}</span>
                  {pct !== null && <span className="ml-auto">{pct}%</span>}
                </div>
                {t.maxParticipants ? (
                  <div className="h-1.5 bg-[#252525] rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-[#f0a500] rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                ) : <div className="mb-4" />}

                <div className="flex items-center gap-2">
                  <Link href={`/tournaments/${t.id}`} className="tap flex-1 inline-flex items-center justify-center bg-[#252525] hover:bg-gray-700 text-white text-sm font-bold px-4 rounded-lg transition-colors">Ver detalhes<span className="sr-only"> de {t.name}</span></Link>
                  <ShareButton url={`/tournaments/${t.id}`} title={t.name} className="w-11 h-11" />
                  {t.isJoined ? (
                    <span className="flex-1 text-center bg-green-500/20 text-green-200 text-sm font-bold px-4 py-2.5 rounded-lg border border-green-500/40">✓ Inscrito</span>
                  ) : t.canJoin ? (
                    <Link href={`/tournaments/${t.id}?aba=resumo`} className="tap flex-1 inline-flex items-center justify-center bg-[#f0a500] hover:bg-[#d4940a] text-black text-sm font-bold px-4 rounded-lg transition-colors">Participar<span className="sr-only"> de {t.name}</span></Link>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Which league hosts the event — or a partnership between the leagues.
function CommunityBadge({ slug, partnership }: { slug: string; partnership: boolean }) {
  if (partnership) {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full border border-white/20 bg-white/5 text-gray-200">
        🤝 LBL + LBM
      </span>
    );
  }
  const c = communityOf(slug);
  return (
    <span
      className="text-xs font-semibold pl-1 pr-2.5 py-0.5 rounded-full border inline-flex items-center gap-1.5"
      style={{ color: c.color, borderColor: `${c.color}55`, background: `${c.color}1a` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.logo} alt="" className="w-5 h-5 rounded-full object-cover" />
      {c.name}
    </span>
  );
}
