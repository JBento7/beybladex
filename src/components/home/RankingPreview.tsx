import Link from "next/link";
import { Medal } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/PageHeader";
import PlayerRow from "./PlayerRow";
import type { RankingEntry } from "@/lib/rankingMath";

type Row = RankingEntry & { position: number };

// Top 5 of the league ranking (the home page shows the current monthly ranking). If the signed-in player is outside the top 5,
// their real position is shown on a separate line (never moved into the top).
// No up/down arrows: there is no ranking history to compare against.
export default function RankingPreview({
  top,
  me,
  currentUserId,
  title,
  league = "lbl",
  href,
  subtitle = "Pontuação acumulada em torneios oficiais da liga.",
  emptyText = "O ranking aparece depois do primeiro torneio oficial concluído.",
}: {
  top: Row[];
  me: Row | null;
  currentUserId?: string | null;
  /** e.g. "Ranking mensal da LBL · outubro de 2026". */
  title: string;
  /** League of the data; the full-ranking link opens the same one. */
  league?: "lbl" | "lbm";
  /** Full ranking link (defaults to the league's ranking page). */
  href?: string;
  subtitle?: string;
  emptyText?: string;
}) {
  return (
    <section aria-labelledby="ranking-titulo" className="rounded-card border border-line bg-card shadow-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <SectionTitle id="ranking-titulo">{title}</SectionTitle>
          <p className="mt-1 text-small text-fg-2">
            {subtitle}{" "}
            <Link href="/regras#ranking" className="underline underline-offset-2 text-fg hover:text-brand-yellow">Como os pontos funcionam</Link>
          </p>
        </div>
      </div>
      {top.length === 0 ? (
        <div className="mt-6 rounded-ctl bg-field p-6 text-center">
          <Medal aria-hidden="true" className="mx-auto w-8 h-8 text-fg-3" />
          <p className="mt-2 text-body text-fg-2">{emptyText}</p>
        </div>
      ) : (
        <>
          <ol className="mt-4 space-y-1" aria-label="Cinco primeiros do ranking">
            {top.map((r) => (
              <PlayerRow key={r.id} position={r.position} userId={r.id} name={r.name} avatarUrl={r.avatarUrl} points={r.points} isMe={r.id === currentUserId} />
            ))}
          </ol>
          {me && (
            <>
              <p className="mt-3 mb-1 px-3 text-label uppercase tracking-wide text-fg-3">Sua posição</p>
              <ol aria-label="Sua posição no ranking">
                <PlayerRow position={me.position} userId={me.id} name={me.name} avatarUrl={me.avatarUrl} points={me.points} isMe />
              </ol>
            </>
          )}
        </>
      )}
      <div className="mt-5">
        <ButtonLink href={href ?? `/rankings?r=${league}`} variant="secondary" className="w-full sm:w-auto">Ver ranking completo</ButtonLink>
      </div>
    </section>
  );
}
