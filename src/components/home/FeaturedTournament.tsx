import { CalendarDays, Coins, MapPin, Trophy, Users } from "lucide-react";
import StatusBadge, { Tag } from "@/components/ui/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import DefaultCover from "./DefaultCover";
import { formatEventDate, formatLabel, formatMoney } from "@/lib/format";
import type { FeaturedEvent } from "@/lib/homeData";

// Main card: the event happening now, or the next one taking sign-ups.
// Desktop: image ~45% | info ~55%. Phone: 16:9 image above the info.
// Only real data: no capacity bar without a configured limit, no made-up date.
export default function FeaturedTournament({
  event,
  registered,
  channelUrl,
}: {
  event: FeaturedEvent | null;
  registered: boolean;
  channelUrl?: string;
}) {
  if (!event) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="O próximo encontro está sendo preparado."
        actions={
          <>
            <ButtonLink href="/tournaments?status=anteriores" variant="primary">Ver últimos resultados</ButtonLink>
            {channelUrl && (
              <a href={channelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center min-h-12 px-5 rounded-ctl text-small font-semibold bg-field text-fg border border-line hover:bg-hover transition-colors duration-150">
                Acompanhar o canal oficial
              </a>
            )}
          </>
        }
      >
        Quando um novo evento for publicado, ele aparece aqui.
      </EmptyState>
    );
  }

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
    <article aria-labelledby="destaque-titulo" className="rounded-card border border-line bg-card shadow-card overflow-hidden md:grid md:grid-cols-[45fr_55fr]">
      <div className="relative aspect-video md:aspect-auto md:min-h-[320px] bg-field">
        {event.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <DefaultCover name={event.name} date={date} className="absolute inset-0" />
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
          {event.isPartnership && <Tag>LBL + LBM</Tag>}
        </div>
        <div>
          <p className="text-small font-semibold text-fg-2">{event.status === "IN_PROGRESS" ? "Acontecendo agora" : "Próximo encontro"}</p>
          <h2 id="destaque-titulo" className="font-display text-title-1 desk:text-title-1-lg text-fg break-anywhere">{event.name}</h2>
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
          {primary && <ButtonLink href={primary.href} variant="primary">{primary.label}</ButtonLink>}
          <ButtonLink href={href} variant="secondary">Ver detalhes<span className="sr-only"> de {event.name}</span></ButtonLink>
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
