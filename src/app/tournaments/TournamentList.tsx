"use client";

import { useEffect, useMemo, useState } from "react";
import ShareButton from "@/components/ShareButton";
import { CalendarDays, MapPin, Search, Users, X } from "lucide-react";
import StatusBadge, { Tag } from "@/components/ui/StatusBadge";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import DefaultCover from "@/components/home/DefaultCover";
import { formatEventDate, formatMoney, hasWallTime } from "@/lib/format";
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

  // Back from a tournament page: restore where the visitor was in the list.
  useEffect(() => {
    try {
      const key = `lbl:lista:${window.location.search}`;
      const y = sessionStorage.getItem(key);
      if (y) { sessionStorage.removeItem(key); requestAnimationFrame(() => window.scrollTo(0, Number(y))); }
    } catch { /* storage unavailable */ }
  }, []);
  const rememberScroll = () => {
    try { sessionStorage.setItem(`lbl:lista:${window.location.search}`, String(window.scrollY)); } catch { /* ignore */ }
  };

  const fieldCls = "w-full min-h-12 bg-field border border-line rounded-ctl px-[14px] text-body text-fg outline-none transition-colors duration-150 hover:border-fg-3";

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] mb-4">
        <div>
          <label htmlFor="busca-torneios" className="block text-small font-semibold text-fg mb-1.5">Buscar</label>
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-[14px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-fg-3" />
            <input
              id="busca-torneios"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome, local ou organizador"
              autoComplete="off"
              className={`${fieldCls} pl-10`}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:contents">
          <div>
            <label htmlFor="filtro-liga" className="block text-small font-semibold text-fg mb-1.5">Liga</label>
            <select id="filtro-liga" value={liga} onChange={(e) => setLiga(parseLiga(e.target.value))} className={fieldCls}>
              <option value="todas">Todas as ligas</option>
              {COMMUNITY_LIST.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="filtro-status" className="block text-small font-semibold text-fg mb-1.5">Situação</label>
            <select id="filtro-status" value={status} onChange={(e) => setStatus(parseStatus(e.target.value))} className={fieldCls}>
              {STATUS_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>{f.label} ({counts[f.key]})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6 min-h-11">
        <p className="text-small text-fg-2" aria-live="polite">
          {filtered.length} torneio{filtered.length === 1 ? "" : "s"}
          {status !== "todos" && <> · <strong className="text-fg">{current.label}</strong></>}
          {liga !== "todas" && <> · <strong className="text-fg">{communityOf(liga).name}</strong></>}
          {query.trim() && <> · busca “{query.trim()}”</>}
        </p>
        {anyFilter && (
          <Button variant="secondary" size="sm" onClick={clearAll}>
            <X aria-hidden="true" className="w-4 h-4" /> Limpar filtros
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        status === "proximos" && !query.trim() ? (
          <EmptyState
            icon={CalendarDays}
            title="Ainda não há próximos campeonatos anunciados."
            actions={
              <>
                <Button variant="primary" onClick={() => setStatus("anteriores")}>Ver torneios anteriores</Button>
                {OFFICIAL_CHANNEL_URL && (
                  <a href={OFFICIAL_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>{OFFICIAL_CHANNEL_LABEL}</a>
                )}
              </>
            }
          >
            Quando um novo evento for publicado, ele aparece aqui.
          </EmptyState>
        ) : (
          <EmptyState
            icon={Search}
            title="Nenhum torneio encontrado com esses filtros."
            actions={<Button variant="primary" onClick={clearAll}>Limpar filtros</Button>}
          >
            Tente outra busca, outra liga ou outra situação.
          </EmptyState>
        )
      ) : status === "todos" ? (
        <div className="space-y-8">
          {SECTIONS.map((s) => {
            const list = filtered.filter((t) => s.statuses.includes(t.status));
            if (list.length === 0) return null;
            return (
              <section key={s.key} aria-labelledby={`sec-${s.key}`}>
                <h2 id={`sec-${s.key}`} className="font-display text-title-2 desk:text-title-2-lg text-fg mb-4">
                  {s.label} <span className="text-fg-3 text-title-3">({list.length})</span>
                </h2>
                <Grid list={list} onOpen={rememberScroll} />
              </section>
            );
          })}
        </div>
      ) : (
        <Grid list={filtered} onOpen={rememberScroll} />
      )}
    </div>
  );
}

// Cards: 3 columns on desktop, 2 on tablet, 1 on phones — and fewer whenever
// a card would get narrower than ~300px (e.g. desktop with the menu open).
function Grid({ list, onOpen }: { list: Tournament[]; onOpen: () => void }) {
  return (
    <ul
      className="grid gap-4 desk:gap-6"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, max(18.75rem, calc((100% - 3rem) / 3))), 1fr))" }}
    >
      {list.map((t) => <TournamentCard key={t.id} t={t} onOpen={onOpen} />)}
    </ul>
  );
}

function TournamentCard({ t, onOpen }: { t: Tournament; onOpen: () => void }) {
  const date = formatEventDate(t.startDate, hasWallTime(t.startDate));
  const fee = formatMoney(t.entryFee);
  const href = `/tournaments/${t.id}`;
  const primary =
    t.status === "IN_PROGRESS" ? { label: "Acompanhar", href: `${href}?aba=partidas` }
      : t.status === "FINISHED" ? { label: "Ver resultados", href: `${href}?aba=classificacao` }
      : t.isJoined ? { label: "Ver minha inscrição", href: `${href}?aba=resumo` }
      : t.status === "REGISTRATION" && t.canJoin ? { label: "Inscrever-se", href: `${href}?aba=resumo` }
      : null;
  return (
    <li className="flex flex-col rounded-card border border-line bg-card shadow-card overflow-hidden min-w-0">
      <div className="relative aspect-video bg-field">
        {t.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.bannerUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <DefaultCover name={t.name} date={date} className="absolute inset-0" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {t.isJoined && t.status === "REGISTRATION" ? <Tag tone="info">Você está inscrito</Tag> : <StatusBadge status={t.status} />}
          <CommunityBadge slug={t.communitySlug} partnership={t.isPartnership} />
          {!t.isOfficial && <Tag>BeyEncontro</Tag>}
        </div>
        <h3 className="font-display text-title-3 text-fg line-clamp-3 break-anywhere">{t.name}</h3>
        <dl className="space-y-1.5 text-small text-fg-2">
          <Row Icon={CalendarDays} label="Data">{date ?? (t.status === "DRAFT" || t.status === "REGISTRATION" ? "Data a definir" : "Data não informada")}</Row>
          {t.location && <Row Icon={MapPin} label="Local">{t.location}</Row>}
          {(fee || t.participantCount > 0 || t.maxParticipants) && (
            <Row Icon={Users} label="Participantes e taxa">
              {t.maxParticipants ? `${t.participantCount} de ${t.maxParticipants} vagas` : `${t.participantCount} inscrito${t.participantCount === 1 ? "" : "s"}`}
              {fee && <> · {fee}</>}
            </Row>
          )}
        </dl>
        {t.description && <p className="text-small text-fg-2 line-clamp-2 break-anywhere">{t.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {primary && (
            <ButtonLink href={primary.href} onClick={onOpen} variant={t.status === "FINISHED" ? "secondary" : "primary"} size="sm" className="flex-1">
              {primary.label}<span className="sr-only">: {t.name}</span>
            </ButtonLink>
          )}
          {(!primary || t.status === "REGISTRATION") && (
            <ButtonLink href={href} onClick={onOpen} variant="secondary" size="sm" className="flex-1">
              Ver detalhes<span className="sr-only"> de {t.name}</span>
            </ButtonLink>
          )}
          <ShareButton url={href} title={t.name} className="w-11 h-11 !rounded-ctl !bg-field border border-line" />
        </div>
      </div>
    </li>
  );
}

function Row({ Icon, label, children }: { Icon: typeof CalendarDays; label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="flex gap-2 min-w-0">
        <Icon aria-hidden="true" className="w-[18px] h-[18px] mt-px shrink-0 text-fg-3" />
        <span className="min-w-0 break-anywhere">{children}</span>
      </dd>
    </div>
  );
}

// Which league hosts the event — or a partnership between the leagues.
function CommunityBadge({ slug, partnership }: { slug: string; partnership: boolean }) {
  if (partnership) return <Tag>LBL + LBM</Tag>;
  const c = communityOf(slug);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-tag border border-line bg-field pl-1 pr-2 py-0.5 text-label text-fg-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.logo} alt="" className="w-5 h-5 rounded-full object-cover" />
      {c.name}
    </span>
  );
}
