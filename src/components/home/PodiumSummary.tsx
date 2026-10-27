import Link from "next/link";
import { Trophy } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/shell/AccountMenu";
import { formatEventDate } from "@/lib/format";
import type { LastEvent, PodiumPerson } from "@/lib/homeData";

// Last finished event: champion first (64px avatar, yellow accent), then 2nd
// and 3rd. Only positions the results decided are shown — never inferred.
export default function PodiumSummary({ event }: { event: LastEvent | null }) {
  return (
    <section aria-labelledby="podio-titulo" className="rounded-card border border-line bg-card shadow-card p-5 md:p-6 flex flex-col">
      <SectionTitle id="podio-titulo">Último torneio</SectionTitle>
      {!event ? (
        <p className="mt-3 text-body text-fg-2">Ainda não há torneios concluídos.</p>
      ) : (
        <>
          <p className="mt-1 text-body font-semibold text-fg break-anywhere">{event.name}</p>
          {event.date && <p className="text-small text-fg-2">{formatEventDate(event.date, false)}</p>}

          {event.first ? (
            <div className="mt-4 flex items-center gap-4 rounded-ctl border border-brand-yellow/40 bg-brand-yellow/10 p-4">
              <Avatar name={event.first.name} url={event.first.avatarUrl} size={64} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-small font-semibold text-brand-yellow">
                  <Trophy aria-hidden="true" className="w-6 h-6" /> Campeão
                </p>
                <PersonLink person={event.first} className="font-display text-title-3 text-fg" />
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-ctl bg-field p-4 text-small text-fg-2">
              Este torneio foi encerrado sem as partidas decisivas, então não há pódio definido.
            </p>
          )}

          {(event.second || event.third) && (
            <ol className="mt-3 space-y-1">
              {([[2, event.second], [3, event.third]] as const).map(([pos, p]) =>
                p ? (
                  <li key={pos} className="flex items-center gap-3 min-h-14 px-1">
                    <span className={`w-16 shrink-0 whitespace-nowrap text-small font-semibold ${pos === 2 ? "text-medal-silver" : "text-medal-bronze"}`}>{pos}º lugar</span>
                    <Avatar name={p.name} url={p.avatarUrl} size={40} />
                    <PersonLink person={p} className="text-body font-semibold text-fg" />
                  </li>
                ) : null
              )}
            </ol>
          )}
          {event.first && !event.third && <p className="mt-2 text-small text-fg-3">3º lugar não definido nos resultados.</p>}

          <div className="mt-5 md:mt-auto pt-1">
            <ButtonLink href={`/tournaments/${event.id}?aba=classificacao`} variant="secondary" className="w-full sm:w-auto">
              Ver resultados<span className="sr-only"> de {event.name}</span>
            </ButtonLink>
          </div>
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
