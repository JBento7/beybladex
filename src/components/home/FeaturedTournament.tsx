import { CalendarDays, Coins, MapPin, Trophy, Users } from "lucide-react";
import StatusBadge, { Tag } from "@/components/ui/StatusBadge";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import EventCover from "@/components/EventCover";
import { formatEventDate, formatLabel, formatMoney } from "@/lib/format";
import type { FeaturedEvent } from "@/lib/homeData";

// Card of one active event (a slide of the home carousel, or the only one).
// Desktop: image ~45% | info ~55%. Phone: 16:9 image above the info.
// Only real data: no capacity bar without a configured limit, no made-up date.
// No hooks: rendered by the server page or by the carousel (client).
export default function FeaturedTournament({
  event,
  registered,
  headingId = "destaque-titulo",
  cover = "lazy",
  className = "",
  prefetch,
}: {
  event: FeaturedEvent;
  registered: boolean;
  /** Unique per card (several slides on the page). */
  headingId?: string;
  /** "priority": first/only card · "lazy": normal · "none": slide not reached yet (placeholder, nothing downloaded). */
  cover?: "priority" | "lazy" | "none";
  className?: string;
  /** false in the carousel: showing a slide must not render other pages on the server. */
  prefetch?: boolean;
}) {
  const date = formatEventDate(event.startDate, event.hasTime);
  const fee = formatMoney(event.entryFee);
  const href = `/tournaments/${event.id}`;
  const primary =
    event.status === "IN_PROGRESS"
      ? { label: "Acompanhar torneio", href: `${href}?aba=partidas` }
      : registered
        ? { label: "Ver minha inscrição", href: `${href}?aba=resumo` }
        : event.registrationOpen
          ? { label: "Inscrever-se", href: `${href}?aba=resumo` }
          : null;
  const closedReason =
    event.status === "REGISTRATION" && !event.registrationOpen && !registered
      ? event.maxParticipants && event.participantCount >= event.maxParticipants ? "Vagas esgotadas" : "Inscrições encerradas"
      : null;
  const pct = event.maxParticipants ? Math.min(100, Math.round((event.participantCount / event.maxParticipants) * 100)) : null;

  return (
    <article aria-labelledby={headingId} className={`rounded-card border border-line bg-card shadow-card overflow-hidden md:grid md:grid-cols-[45fr_55fr] ${className}`}>
      <div className="relative aspect-video md:aspect-auto md:min-h-[320px] bg-field">
        {cover !== "none" && (
          <div className="absolute inset-0">
            <EventCover bannerUrl={event.bannerUrl} communitySlug={event.communitySlug} isPartnership={event.isPartnership} priority={cover === "priority"} />
          </div>
        )}
      </div>
      <div className="p-5 md:p-8 flex flex-col gap-4 min-w-0">
        <div className="flex flex-wrap gap-2">
          {registered && event.status === "REGISTRATION" ? (
            <Tag tone="info">Você está inscrito</Tag>
          ) : closedReason ? (
            <Tag>{closedReason}</Tag>
          ) : (
            <StatusBadge status={event.status} />
          )}
          <Tag tone={event.isOfficial ? "yellow" : "neutral"}>{event.isOfficial ? "Oficial · vale ranking" : "BeyEncontro"}</Tag>
          {event.doubleRankingPoints && <Tag tone="yellow"><span aria-hidden="true">×2</span> Pontuação dobrada</Tag>}
          {event.isPartnership && <Tag>LBL + LBM</Tag>}
        </div>
        <div>
          <p className="text-small font-semibold text-fg-2">{event.status === "IN_PROGRESS" ? "Acontecendo agora" : "Próximo encontro"}</p>
          <h2 id={headingId} className="font-display text-title-1 desk:text-title-1-lg text-fg break-anywhere">{event.name}</h2>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 text-small">
          <Info Icon={CalendarDays} label="Data">{date ?? "Data a definir"}</Info>
          {event.venue && <Info Icon={MapPin} label="Local">{event.venue}{event.address ? <span className="block text-fg-3">{event.address}</span> : null}</Info>}
          <Info Icon={Trophy} label="Formato">{formatLabel(event.format, event.qualifiers, event.deckType)}</Info>
          {fee && <Info Icon={Coins} label="Inscrição">{fee}</Info>}
          {event.maxParticipants ? (
            <Info Icon={Users} label="Vagas">
              {event.participantCount} de {event.maxParticipants} preenchidas
              <span aria-hidden="true" className="mt-1.5 block h-1.5 w-full rounded-full bg-field overflow-hidden">
                <span className="block h-full bg-success" style={{ width: `${pct}%` }} />
              </span>
            </Info>
          ) : (
            <Info Icon={Users} label="Participantes">{event.participantCount} inscrito{event.participantCount === 1 ? "" : "s"}</Info>
          )}
        </dl>
        <div className="mt-auto flex flex-wrap gap-3 pt-2">
          {primary && <ButtonLink href={primary.href} variant="primary" prefetch={prefetch}>{primary.label}</ButtonLink>}
          <ButtonLink href={href} variant="secondary" prefetch={prefetch}>Ver detalhes<span className="sr-only"> de {event.name}</span></ButtonLink>
        </div>
      </div>
    </article>
  );
}

function Info({ Icon, label, children }: { Icon: typeof CalendarDays; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="sr-only">{label}</dt>
      <dd className="flex gap-2.5 text-fg break-anywhere">
        <Icon aria-hidden="true" className="w-[18px] h-[18px] mt-0.5 shrink-0 text-fg-3" />
        <span className="min-w-0">{children}</span>
      </dd>
    </div>
  );
}

/** No active event: compact notice that must not dominate the page. */
export function NoActiveTournament({ channelUrl }: { channelUrl?: string }) {
  return (
    <section
      aria-labelledby="sem-evento-titulo"
      className="rounded-card border border-line bg-card p-5 md:p-6 flex flex-col gap-4 md:flex-row md:items-center md:gap-5"
    >
      <div className="flex items-start gap-4 md:gap-5 md:flex-1 min-w-0">
        <CalendarDays aria-hidden="true" className="w-8 h-8 shrink-0 text-fg-3" />
        <div className="min-w-0">
          <h2 id="sem-evento-titulo" className="font-display text-title-4 text-fg">Nenhum torneio ativo no momento</h2>
          <p className="mt-1 text-small text-fg-2">Veja os próximos encontros e os resultados dos últimos na página de torneios.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 md:shrink-0">
        <ButtonLink href="/tournaments" variant="secondary" className="w-full sm:w-auto">Ver torneios</ButtonLink>
        {channelUrl && (
          <a href={channelUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "md", "w-full sm:w-auto")}>
            Acompanhar o canal oficial
          </a>
        )}
      </div>
    </section>
  );
}
