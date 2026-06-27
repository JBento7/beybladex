// Motor algorítmico de sugestão de combos por estilo.
//
// Um combo = BLADE + RATCHET + BIT. Cada peça tem stats (attack/defense/stamina/
// burst/dash/height). Pontuamos cada combo de acordo com o estilo escolhido,
// e damos um bônus baseado no desempenho real da comunidade (win rate) das peças
// que já apareceram em partidas registradas.

export type ComboStyle = "ATTACK" | "DEFENSE" | "STAMINA";

export type SuggesterPart = {
  id: string;
  line: string;
  category: string;
  name: string;
  imageUrl: string | null;
  statAttack: number | null;
  statDefense: number | null;
  statStamina: number | null;
  statBurst: number | null;
  statDash: number | null;
  statHeight: number | null;
};

// Win rate por nome de peça (vem de Beyblade.wins/losses agregados por campo).
export type PartWinRates = Record<string, { wins: number; losses: number }>;

export type ComboSuggestion = {
  blade: SuggesterPart;
  ratchet: SuggesterPart;
  bit: SuggesterPart;
  score: number; // 0-100
  styleScore: number; // contribuição dos stats (0-100)
  communityScore: number; // contribuição do win rate (0-100)
  sampleSize: number; // total de partidas das peças usadas
  totals: { attack: number; defense: number; stamina: number; burst: number };
};

// Peso de cada stat por estilo. Soma dos pesos = 1 dentro de cada estilo.
const STYLE_WEIGHTS: Record<ComboStyle, Partial<Record<keyof SuggesterPart, number>>> = {
  ATTACK: { statAttack: 0.6, statBurst: 0.25, statDash: 0.15 },
  DEFENSE: { statDefense: 0.6, statStamina: 0.2, statBurst: 0.2 },
  STAMINA: { statStamina: 0.65, statDefense: 0.2, statDash: 0.15 },
};

function s(part: SuggesterPart, key: keyof SuggesterPart): number {
  const v = part[key];
  return typeof v === "number" ? v : 0;
}

// Pontuação de estilo de uma peça (stats em escala ~0-100 já no banco).
function partStyleScore(part: SuggesterPart, style: ComboStyle): number {
  const weights = STYLE_WEIGHTS[style];
  let total = 0;
  for (const [key, w] of Object.entries(weights)) {
    total += s(part, key as keyof SuggesterPart) * (w as number);
  }
  return total;
}

// Win rate suavizado (Laplace) para não premiar 1 vitória em 1 jogo.
function smoothedWinRate(wins: number, losses: number): number {
  return (wins + 1) / (wins + losses + 2);
}

function partCommunity(name: string, rates: PartWinRates) {
  const r = rates[name];
  if (!r) return { rate: 0.5, sample: 0 };
  return { rate: smoothedWinRate(r.wins, r.losses), sample: r.wins + r.losses };
}

export type ComboAnalysis = {
  totals: { attack: number; defense: number; stamina: number; burst: number };
  styleScores: Record<ComboStyle, number>; // 0-100 por estilo
  bestStyle: ComboStyle;
  bestStyleScore: number;
  communityScore: number | null; // win rate % (null se sem partidas)
  sampleSize: number;
  percentile: number; // 0-100: quão bom é vs todos os combos no melhor estilo
  rank: number; // posição entre todos os combos possíveis (1 = melhor)
  totalCombos: number;
  verdict: "EXCELENTE" | "BOM" | "MEDIANO" | "FRACO";
  worthIt: boolean;
  reasons: string[];
};

const STYLE_LABEL: Record<ComboStyle, string> = {
  ATTACK: "Ataque",
  DEFENSE: "Defesa",
  STAMINA: "Stamina",
};

// Analisa um combo específico montado pelo usuário e estima se vale a pena.
export function analyzeCombo(
  blade: SuggesterPart,
  ratchet: SuggesterPart,
  bit: SuggesterPart,
  rates: PartWinRates,
  allBlades: SuggesterPart[],
  allRatchets: SuggesterPart[],
  allBits: SuggesterPart[]
): ComboAnalysis {
  const parts = [blade, ratchet, bit];

  const styleScores = {} as Record<ComboStyle, number>;
  for (const style of ["ATTACK", "DEFENSE", "STAMINA"] as ComboStyle[]) {
    styleScores[style] =
      Math.round((parts.reduce((acc, p) => acc + partStyleScore(p, style), 0) / 3) * 10) / 10;
  }

  let bestStyle: ComboStyle = "ATTACK";
  for (const style of ["DEFENSE", "STAMINA"] as ComboStyle[]) {
    if (styleScores[style] > styleScores[bestStyle]) bestStyle = style;
  }
  const bestStyleScore = styleScores[bestStyle];

  // Win rate da comunidade para as peças deste combo.
  const comm = parts.map((p) => partCommunity(p.name, rates));
  const sampleSize = comm.reduce((acc, c) => acc + c.sample, 0);
  const avgRate = comm.reduce((acc, c) => acc + c.rate, 0) / 3;
  const communityScore = sampleSize > 0 ? Math.round(avgRate * 1000) / 10 : null;

  // Percentil: gera o style score de todos os combos possíveis no melhor estilo
  // e vê quantos esse combo supera.
  const allScores: number[] = [];
  for (const bl of allBlades) {
    const blS = partStyleScore(bl, bestStyle);
    for (const rt of allRatchets) {
      const rtS = partStyleScore(rt, bestStyle);
      for (const bt of allBits) {
        allScores.push((blS + rtS + partStyleScore(bt, bestStyle)) / 3);
      }
    }
  }
  const totalCombos = allScores.length || 1;
  const beaten = allScores.filter((x) => bestStyleScore >= x).length;
  const percentile = Math.round((beaten / totalCombos) * 100);
  const sorted = [...allScores].sort((a, b) => b - a);
  const rank = sorted.findIndex((x) => x <= bestStyleScore) + 1 || totalCombos;

  // Veredito combinando percentil de stats + win rate (quando há dados).
  const reasons: string[] = [];
  let verdictScore = percentile; // base nos stats

  reasons.push(
    `Otimizado para ${STYLE_LABEL[bestStyle]} (${bestStyleScore.toFixed(0)} pts), ` +
      `melhor que ${percentile}% dos combos possíveis.`
  );

  if (communityScore !== null) {
    if (sampleSize >= 10) {
      // Mistura: 60% stats, 40% win rate real.
      verdictScore = percentile * 0.6 + communityScore * 0.4;
      reasons.push(
        `Win rate real de ${communityScore.toFixed(0)}% em ${sampleSize} partidas da comunidade.`
      );
    } else {
      reasons.push(
        `Poucos dados de partidas (${sampleSize}) — win rate de ${communityScore.toFixed(
          0
        )}% ainda é pouco confiável.`
      );
    }
  } else {
    reasons.push("Sem histórico de partidas para estas peças ainda — análise baseada só nos stats.");
  }

  // Avisa se as peças estão "espalhadas" (combo sem identidade clara).
  const spread = Math.max(...Object.values(styleScores)) - Math.min(...Object.values(styleScores));
  if (spread < 8) {
    reasons.push("Stats equilibrados, sem um ponto forte claro — combo versátil, porém sem foco.");
  }

  let verdict: ComboAnalysis["verdict"];
  if (verdictScore >= 80) verdict = "EXCELENTE";
  else if (verdictScore >= 60) verdict = "BOM";
  else if (verdictScore >= 35) verdict = "MEDIANO";
  else verdict = "FRACO";

  return {
    totals: {
      attack: parts.reduce((a, p) => a + s(p, "statAttack"), 0),
      defense: parts.reduce((a, p) => a + s(p, "statDefense"), 0),
      stamina: parts.reduce((a, p) => a + s(p, "statStamina"), 0),
      burst: parts.reduce((a, p) => a + s(p, "statBurst"), 0),
    },
    styleScores,
    bestStyle,
    bestStyleScore,
    communityScore,
    sampleSize,
    percentile,
    rank,
    totalCombos,
    verdict,
    worthIt: verdictScore >= 55,
    reasons,
  };
}

export function suggestCombos(
  blades: SuggesterPart[],
  ratchets: SuggesterPart[],
  bits: SuggesterPart[],
  rates: PartWinRates,
  style: ComboStyle,
  limit = 12
): ComboSuggestion[] {
  // Para não explodir em blades×ratchets×bits, pegamos os melhores candidatos
  // de cada categoria pelo style score antes de combinar.
  const TOP = 8;
  const topBy = (arr: SuggesterPart[]) =>
    [...arr].sort((a, b) => partStyleScore(b, style) - partStyleScore(a, style)).slice(0, TOP);

  const bl = topBy(blades);
  const rt = topBy(ratchets);
  const bt = topBy(bits);

  const out: ComboSuggestion[] = [];

  for (const blade of bl) {
    for (const ratchet of rt) {
      for (const bit of bt) {
        const parts = [blade, ratchet, bit];

        // Style score médio das 3 peças (0-100).
        const styleScore = parts.reduce((acc, p) => acc + partStyleScore(p, style), 0) / 3;

        // Community score: média do win rate suavizado das peças (0-100).
        const comm = parts.map((p) => partCommunity(p.name, rates));
        const avgRate = comm.reduce((acc, c) => acc + c.rate, 0) / 3;
        const sampleSize = comm.reduce((acc, c) => acc + c.sample, 0);
        const communityScore = avgRate * 100;

        // Quanto mais partidas, mais peso o win rate ganha (até 35%).
        const confidence = Math.min(sampleSize / 30, 1);
        const communityWeight = 0.35 * confidence;
        const score = styleScore * (1 - communityWeight) + communityScore * communityWeight;

        out.push({
          blade,
          ratchet,
          bit,
          score: Math.round(score * 10) / 10,
          styleScore: Math.round(styleScore * 10) / 10,
          communityScore: Math.round(communityScore * 10) / 10,
          sampleSize,
          totals: {
            attack: parts.reduce((a, p) => a + s(p, "statAttack"), 0),
            defense: parts.reduce((a, p) => a + s(p, "statDefense"), 0),
            stamina: parts.reduce((a, p) => a + s(p, "statStamina"), 0),
            burst: parts.reduce((a, p) => a + s(p, "statBurst"), 0),
          },
        });
      }
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
