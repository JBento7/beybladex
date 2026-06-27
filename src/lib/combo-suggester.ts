// Motor algorítmico de sugestão de combos por estilo.
//
// Um combo = BLADE + RATCHET + BIT. Cada peça tem stats (attack/defense/stamina/
// burst/dash/height). Pontuamos cada combo de acordo com o estilo escolhido,
// e damos um bônus baseado no desempenho real da comunidade (win rate) das peças
// que já apareceram em partidas registradas.

import { metaForPart, META_TIER_SCORE, type MetaTier } from "@/lib/meta-tiers";

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
  metaScore: number | null; // contribuição do meta mundial (0-100)
  sampleSize: number; // total de partidas das peças usadas
  totals: { attack: number; defense: number; stamina: number; burst: number };
};

// Pontuação de meta (0-100) de um conjunto de peças; null se nenhuma reconhecida.
function partsMetaScore(parts: SuggesterPart[]): number | null {
  let sum = 0;
  let count = 0;
  for (const p of parts) {
    const entry = metaForPart(p.name);
    if (entry) {
      sum += META_TIER_SCORE[entry.tier];
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

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

export type ComboMetaPart = { name: string; tier: MetaTier; note?: string };

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
  metaScore: number | null; // 0-100 baseado no tier list do meta mundial
  metaParts: ComboMetaPart[]; // peças reconhecidas no meta competitivo
  verdict: "EXCELENTE" | "BOM" | "MEDIANO" | "FRACO";
  worthIt: boolean;
  reasons: string[];
};

const STYLE_LABEL: Record<ComboStyle, string> = {
  ATTACK: "Ataque",
  DEFENSE: "Defesa",
  STAMINA: "Stamina",
};

// Média do style score de um conjunto de peças para um estilo (0-100).
function partsStyleAvg(parts: SuggesterPart[], style: ComboStyle): number {
  if (parts.length === 0) return 0;
  return parts.reduce((acc, p) => acc + partStyleScore(p, style), 0) / parts.length;
}

// Analisa um combo montado pelo usuário (qualquer linha / nº de peças) e estima
// se vale a pena. `slotPools` traz as opções candidatas de cada slot — usadas
// para calcular o percentil contra os combos possíveis daquela linha.
export function analyzeComboParts(
  selected: SuggesterPart[],
  slotPools: SuggesterPart[][],
  rates: PartWinRates
): ComboAnalysis {
  const parts = selected;
  const n = parts.length || 1;

  const styleScores = {} as Record<ComboStyle, number>;
  for (const style of ["ATTACK", "DEFENSE", "STAMINA"] as ComboStyle[]) {
    styleScores[style] = Math.round(partsStyleAvg(parts, style) * 10) / 10;
  }

  let bestStyle: ComboStyle = "ATTACK";
  for (const style of ["DEFENSE", "STAMINA"] as ComboStyle[]) {
    if (styleScores[style] > styleScores[bestStyle]) bestStyle = style;
  }
  const bestStyleScore = styleScores[bestStyle];

  // Win rate da comunidade para as peças deste combo.
  const comm = parts.map((p) => partCommunity(p.name, rates));
  const sampleSize = comm.reduce((acc, c) => acc + c.sample, 0);
  const avgRate = comm.reduce((acc, c) => acc + c.rate, 0) / n;
  const communityScore = sampleSize > 0 ? Math.round(avgRate * 1000) / 10 : null;

  // Percentil: enumera os combos possíveis (produto cartesiano dos pools, com
  // cada slot limitado aos melhores candidatos no estilo) e conta quantos esse
  // combo supera. O cap mantém a enumeração rápida mesmo para CX (6 slots).
  const CAP = 7;
  const cappedPools = slotPools.map((pool) =>
    [...pool]
      .sort((a, b) => partStyleScore(b, bestStyle) - partStyleScore(a, bestStyle))
      .slice(0, CAP)
      .map((p) => partStyleScore(p, bestStyle))
  );
  const allScores: number[] = [];
  const walk = (idx: number, sum: number) => {
    if (idx === cappedPools.length) {
      allScores.push(sum / cappedPools.length);
      return;
    }
    for (const v of cappedPools[idx]) walk(idx + 1, sum + v);
  };
  if (cappedPools.length > 0 && cappedPools.every((p) => p.length > 0)) walk(0, 0);

  const totalCombos = allScores.length || 1;
  const beaten = allScores.filter((x) => bestStyleScore >= x).length;
  const percentile = allScores.length > 0 ? Math.round((beaten / totalCombos) * 100) : 50;
  const sorted = [...allScores].sort((a, b) => b - a);
  const rank = allScores.length > 0 ? sorted.findIndex((x) => x <= bestStyleScore) + 1 || totalCombos : 1;

  // Meta score: tier list do meta competitivo mundial (forums/torneios/vídeos).
  const metaParts: ComboMetaPart[] = [];
  let metaSum = 0;
  for (const p of parts) {
    const entry = metaForPart(p.name);
    if (entry) {
      metaParts.push({ name: p.name, tier: entry.tier, note: entry.note });
      metaSum += META_TIER_SCORE[entry.tier];
    }
  }
  // Cobertura = fração das peças reconhecidas no meta. Pondera a confiança.
  const metaCoverage = metaParts.length / n;
  const metaScore = metaParts.length > 0 ? Math.round((metaSum / metaParts.length) * 10) / 10 : null;

  // Veredito combinando: stats (percentil) + win rate da comunidade + meta mundial.
  const reasons: string[] = [];

  reasons.push(
    `Otimizado para ${STYLE_LABEL[bestStyle]} (${bestStyleScore.toFixed(0)} pts), ` +
      `melhor que ${percentile}% dos combos possíveis.`
  );

  // Pesos dinâmicos: meta (até 0.45) e comunidade (até 0.30) crescem com a
  // confiança; o restante fica com os stats.
  const communityConfident = communityScore !== null && sampleSize >= 10;
  const metaWeight = 0.45 * metaCoverage;
  const communityWeight = communityConfident ? Math.min(sampleSize / 30, 1) * 0.3 : 0;
  const statsWeight = Math.max(0, 1 - metaWeight - communityWeight);

  let verdictScore = percentile * statsWeight;
  if (metaScore !== null) verdictScore += metaScore * metaWeight;
  if (communityConfident) verdictScore += (communityScore as number) * communityWeight;
  // Renormaliza caso meta/comunidade estejam ausentes.
  const usedWeight = statsWeight + (metaScore !== null ? metaWeight : 0) + communityWeight;
  if (usedWeight > 0) verdictScore = verdictScore / usedWeight;

  if (metaScore !== null) {
    const best = [...metaParts].sort((a, b) => META_TIER_SCORE[b.tier] - META_TIER_SCORE[a.tier]);
    const sTier = best.filter((m) => m.tier === "S");
    if (sTier.length > 0) {
      reasons.push(
        `Meta mundial: ${sTier.map((m) => m.name).join(", ")} ${
          sTier.length > 1 ? "são peças S-tier" : "é peça S-tier"
        } (staple de torneio).`
      );
    } else {
      reasons.push(
        `Meta mundial: peça(s) destaque ${best
          .slice(0, 2)
          .map((m) => `${m.name} (${m.tier})`)
          .join(", ")}.`
      );
    }
    if (metaCoverage < 1) {
      reasons.push(
        `${metaParts.length} de ${n} peças reconhecidas no meta competitivo — as demais não têm dados.`
      );
    }
  } else {
    reasons.push("Nenhuma destas peças aparece no tier list do meta competitivo ainda.");
  }

  if (communityScore !== null) {
    if (sampleSize >= 10) {
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
    reasons.push("Sem histórico de partidas para estas peças ainda.");
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
    metaScore,
    metaParts,
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
  // de cada categoria antes de combinar — considerando style score + meta mundial
  // para não descartar peças que são staple de torneio mesmo com stat menor.
  const TOP = 8;
  const candScore = (p: SuggesterPart) => {
    const entry = metaForPart(p.name);
    const metaBonus = entry ? META_TIER_SCORE[entry.tier] * 0.4 : 0;
    return partStyleScore(p, style) + metaBonus;
  };
  const topBy = (arr: SuggesterPart[]) =>
    [...arr].sort((a, b) => candScore(b) - candScore(a)).slice(0, TOP);

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

        // Meta mundial das peças do combo (0-100), se reconhecidas.
        const metaScore = partsMetaScore(parts);
        const metaCoverage = parts.filter((p) => metaForPart(p.name)).length / 3;

        // Pesos: meta (até 0.4) e win rate (até 0.3) crescem com a confiança;
        // o restante fica com os stats de estilo.
        const communityWeight = 0.3 * Math.min(sampleSize / 30, 1);
        const metaWeight = metaScore !== null ? 0.4 * metaCoverage : 0;
        const styleWeight = Math.max(0, 1 - communityWeight - metaWeight);
        const score =
          (styleScore * styleWeight +
            communityScore * communityWeight +
            (metaScore ?? 0) * metaWeight) /
          (styleWeight + communityWeight + (metaScore !== null ? metaWeight : 0) || 1);

        out.push({
          blade,
          ratchet,
          bit,
          score: Math.round(score * 10) / 10,
          styleScore: Math.round(styleScore * 10) / 10,
          communityScore: Math.round(communityScore * 10) / 10,
          metaScore: metaScore !== null ? Math.round(metaScore * 10) / 10 : null,
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
