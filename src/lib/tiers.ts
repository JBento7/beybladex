// Blader tiers/divisions based on career official wins. Gives players a sense
// of progression (like the LBB national ranking tiers).
export type Tier = { name: string; color: string; icon: string; min: number };

export const TIERS: Tier[] = [
  { name: "Bronze", color: "#cd7f32", icon: "🥉", min: 0 },
  { name: "Prata", color: "#c0c0c0", icon: "🥈", min: 5 },
  { name: "Ouro", color: "#f0a500", icon: "🥇", min: 15 },
  { name: "Platina", color: "#4fd1c5", icon: "💠", min: 30 },
  { name: "Diamante", color: "#7dd3fc", icon: "💎", min: 60 },
  { name: "Mestre", color: "#c084fc", icon: "👑", min: 100 },
];

// Current tier and progress toward the next one, from a win count.
export function tierFor(wins: number): { tier: Tier; next: Tier | null; progress: number; toNext: number } {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) if (wins >= TIERS[i].min) idx = i;
  const tier = TIERS[idx];
  const next = TIERS[idx + 1] ?? null;
  if (!next) return { tier, next: null, progress: 1, toNext: 0 };
  const span = next.min - tier.min;
  const progress = span > 0 ? Math.min(1, (wins - tier.min) / span) : 1;
  return { tier, next, progress, toNext: Math.max(0, next.min - wins) };
}
