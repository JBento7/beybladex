import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import PageHeader, { SectionTitle } from "@/components/ui/PageHeader";
import { FINISH_TYPE_POINTS } from "@/lib/scoring";
import { effectiveRules } from "@/lib/monthlyRanking";
import { currentMonth, DEFAULT_RULES, monthLabel, TIEBREAKS, type MonthlyRules } from "@/lib/monthlyRules";

export const metadata: Metadata = { title: "Regras" };
// The ranking tables can be changed by the admins (per league): re-read each minute.
export const revalidate = 60;

// General rules of the platform, generated from the same constants the
// scoring and ranking code use, so the page can't drift from the system.
// Each event may publish its own regulation on its page (tab "Regras").
const FINISHES = [
  { key: "SPIN_FINISH", label: "Spin Finish", desc: "O Beyblade adversário para de girar primeiro." },
  { key: "OVER_FINISH", label: "Over Finish", desc: "O adversário sai da área de jogo." },
  { key: "BURST_FINISH", label: "Burst Finish", desc: "O Beyblade adversário se desmonta." },
  { key: "EXTREME_FINISH", label: "Xtreme Finish", desc: "O adversário cai na zona Xtreme." },
  { key: "MISSLAUNCH", label: "Misslaunch do adversário", desc: "O adversário erra o lançamento." },
] as const;

async function rulesOf(league: "lbl" | "lbm", month: string): Promise<MonthlyRules> {
  try { return await effectiveRules(league, month); } catch { return DEFAULT_RULES; }
}

export default async function RulesPage() {
  const month = currentMonth();
  const [lbl, lbm] = await Promise.all([rulesOf("lbl", month), rulesOf("lbm", month)]);
  const same = JSON.stringify(lbl) === JSON.stringify(lbm);
  const tables: { title: string; rules: MonthlyRules }[] = same ? [{ title: "LBL e LBM", rules: lbl }] : [{ title: "LBL", rules: lbl }, { title: "LBM", rules: lbm }];
  const card = "rounded-card border border-line bg-card shadow-card p-5 md:p-6";
  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <main className="mx-auto max-w-content px-4 md:px-6 desk:px-8 py-6 desk:py-8 space-y-6 desk:space-y-8">
        <PageHeader
          title="Regras da plataforma"
          description="Como as batalhas são pontuadas, como funcionam os formatos e de onde vêm os pontos do ranking. Cada evento pode ter um regulamento próprio na página dele."
        />

        <section aria-labelledby="pontuacao" className={card}>
          <SectionTitle id="pontuacao">Pontuação das batalhas</SectionTitle>
          <p className="mt-2 text-body text-fg-2">Cada batalha dá pontos ao vencedor conforme o tipo de finalização. Quem chega primeiro aos pontos do set vence o set.</p>
          <dl className="mt-4 grid gap-3 md:grid-cols-2">
            {FINISHES.map((f) => (
              <div key={f.key} className="flex items-start gap-4 rounded-ctl bg-field p-4">
                <dd className="font-display text-stat tabular text-brand-yellow w-10 shrink-0 text-center">{FINISH_TYPE_POINTS[f.key]}</dd>
                <div>
                  <dt className="text-body font-semibold text-fg">{f.label} <span className="sr-only">: {FINISH_TYPE_POINTS[f.key]} ponto(s)</span></dt>
                  <dd className="text-small text-fg-2">{f.desc}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="formatos" className={card}>
          <SectionTitle id="formatos">Formatos</SectionTitle>
          <ul className="mt-3 space-y-3 text-body text-fg-2 list-disc pl-5">
            <li><strong className="text-fg">Suíço:</strong> várias rodadas em que jogadores com campanhas parecidas se enfrentam. Cada vitória vale 1 ponto suíço; quem fica de folga (bye) também recebe 1 ponto. Desempate por pontos de batalha feitos, depois pelo saldo (feitos − sofridos) e, em empate completo, pela ordem alfabética do apelido. Os melhores avançam para o mata-mata quando o evento tem corte.</li>
            <li><strong className="text-fg">Mata-mata:</strong> quem perde sai. A colocação final segue a fase em que cada jogador parou; a disputa de 3º lugar define o 3º e o 4º.</li>
            <li><strong className="text-fg">Grupos:</strong> pontos corridos dentro de cada grupo, depois eliminatória.</li>
          </ul>
        </section>

        <section id="ranking" aria-labelledby="ranking-titulo" className={`${card} scroll-mt-24`}>
          <SectionTitle id="ranking-titulo">Pontos do ranking</SectionTitle>
          <p className="mt-2 text-body text-fg-2">
            LBL e LBM têm cada uma o seu <strong className="text-fg">ranking mensal</strong>: a soma dos pontos de ranking dos <strong className="text-fg">torneios oficiais finalizados</strong> da liga
            naquele mês, mais os ajustes feitos pela organização. Pontos por colocação em vigor em {monthLabel(month)}:
          </p>
          {tables.map((t) => (
            <div key={t.title} className="mt-4">
              {!same && <p className="text-small font-semibold text-fg">{t.title}</p>}
              <ol className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-3">
                {t.rules.pointsTable.map((pts, i) => (
                  <li key={i} className="rounded-ctl bg-field p-3 text-center">
                    <span className="block text-small text-fg-2">{i + 1}º lugar</span>
                    <span className="block font-display text-stat tabular text-fg">{pts}</span>
                    <span className="block text-label text-fg-3">pontos</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-small text-fg-2">Demais colocações: 0 pontos. Desempate no total do mês: {TIEBREAKS[t.rules.tiebreak].toLowerCase()}; por último, uma ordem fixa por jogador.</p>
            </div>
          ))}
          <ul className="mt-4 space-y-2 text-body text-fg-2 list-disc pl-5">
            <li><strong className="text-fg">Mês do torneio:</strong> o mês da data de início (ou, sem data, o mês em que foi criado), no horário de Brasília.</li>
            <li><strong className="text-fg">Virada do mês:</strong> cada mês começa com todos em 0. Os meses anteriores continuam visíveis na página de rankings.</li>
            <li>Em eventos com mata-mata, só pontua quem chegou ao mata-mata.</li>
            <li>Torneios com <strong className="text-fg">pontuação dobrada</strong> concedem o dobro da tabela (com a tabela acima, 1º lugar: {(tables[0].rules.pointsTable[0] ?? 0) * 2}). Pontos de batalha, sets e desempates das partidas não mudam.</li>
            <li><strong className="text-fg">Tabela de cada torneio:</strong> fica registrada na primeira finalização. Se a organização mudar a tabela depois, torneios já finalizados não são recalculados.</li>
            <li><strong className="text-fg">Ajustes da organização:</strong> pontos adicionados ou retirados aparecem separados dos resultados dos torneios, sempre com motivo registrado. O total do mês nunca fica negativo, e zerar um jogador não apaga os resultados dele.</li>
            <li><strong className="text-fg">Fechamento:</strong> a organização fecha o mês e define o campeão (o 1º colocado). A classificação completa fica arquivada e não muda mais. Fechar a LBL não fecha a LBM.</li>
            <li>BeyEncontros e torneios de teste não contam. Eventos de parceria contam só no ranking compartilhado LBL + LBM, que continua somando todos os eventos de parceria (não é mensal).</li>
          </ul>
        </section>

        <section aria-labelledby="eventos" className={card}>
          <SectionTitle id="eventos">Tipos de evento</SectionTitle>
          <ul className="mt-3 space-y-3 text-body text-fg-2 list-disc pl-5">
            <li><strong className="text-fg">Torneio oficial:</strong> publicado pela organização da liga; conta para o ranking.</li>
            <li><strong className="text-fg">BeyEncontro:</strong> qualquer pessoa com conta pode criar. Registra partidas e estatísticas, mas não conta para o ranking.</li>
            <li><strong className="text-fg">Torneio rápido:</strong> sem cadastro, fica salvo só no aparelho onde foi criado e não aparece no site. <Link href="/quick-tournament" className="underline underline-offset-2 text-fg hover:text-brand-yellow">Criar torneio rápido</Link></li>
          </ul>
        </section>
      </main>
    </div>
  );
}
