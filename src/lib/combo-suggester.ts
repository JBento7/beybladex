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
