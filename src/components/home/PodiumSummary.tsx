import Link from "next/link";
import { Trophy } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/shell/AccountMenu";
import { formatEventDate } from "@/lib/format";
import type { LastEvent, PodiumPerson } from "@/lib/homeData";

// Last finished event, sized to its content: title, event, champion, 2nd/3rd,
// a short real summary, then the action. Only positions the results decided
// are shown — never inferred, never taken from the Swiss table.
export default function PodiumSummary({ event }: { event: LastEvent | null }) {
  return (
    <section aria-labelledby="podio-titulo" className="rounded-card border border-line bg-card shadow-card p-5 md:p-6 space-y-4">
      <SectionTitle id="podio-titulo">Último torneio</SectionTitle>
      {!event ? (
        <p className="text-body text-fg-2">Ainda não há torneios concluídos.</p>
      ) : (
        <>
          <div>
            <p className="text-body font-semibold text-fg break-anywhere">{event.name}</p>
            {event.date && <p className="text-small text-fg-2">{formatEventDate(event.date, false)}</p>}
          </div>

          {event.first ? (
            <div className="flex items-center gap-4 rounded-ctl border border-champion-line bg-champion-bg p-4">
              <Avatar name={event.first.name} url={event.first.avatarUrl} size={56} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-small font-semibold text-brand-yellow">
                  <Trophy aria-hidden="true" className="w-6 h-6" /> Campeão
                </p>
                <PersonLink person={event.first} className="text-title-4 font-semibold text-fg" />
              </div>
            </div>
          ) : (
            <p className="rounded-ctl bg-field p-4 text-small text-fg-2">
              Este torneio foi encerrado sem as partidas decisivas, então não há pódio definido.
            </p>
          )}

          {(event.second || event.third) && (
            <ol className="space-y-2">
              {([[2, event.second], [3, event.third]] as const).map(([pos, p]) =>
                p ? (
                  <li key={pos} className="flex items-center gap-3">
                    <span className={`w-16 shrink-0 whitespace-nowrap text-small font-semibold ${pos === 2 ? "text-medal-silver" : "text-medal-bronze"}`}>{pos}º lugar</span>
                    <Avatar name={p.name} url={p.avatarUrl} size={36} />
                    <PersonLink person={p} className="text-body font-semibold text-fg" />
                  </li>
                ) : null
              )}
            </ol>
          )}
          {event.first && !event.third && <p className="text-small text-fg-3">3º lugar não definido nos resultados.</p>}

          <p className="text-small text-fg-2">
            {event.participantCount} participante{event.participantCount === 1 ? "" : "s"} · {event.formatText}
          </p>

          <ButtonLink href={`/tournaments/${event.id}?aba=classificacao`} variant="secondary" className="w-full sm:w-auto">
            Ver resultados<span className="sr-only"> de {event.name}</span>
          </ButtonLink>
        </>
      )}
    </section>
  );
}

function PersonLink({ person, className }: { person: PodiumPerson; className: string }) {
  return (
    <Link href={`/community/${person.userId}`} className={`block min-w-0 break-anywhere hover:underline underline-offset-2 ${className}`}>
      {person.name}
    </Link>
  );
}
