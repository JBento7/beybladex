// ─────────────────────────────────────────────────────────────────────────────
// TIER LIST DO META COMPETITIVO (Beyblade X)
//
// Curadoria baseada no meta competitivo global — resultados de torneios, World
// Beyblade Organization (WBO), tier lists e vídeos da comunidade. Cada peça
// recebe um tier (S/A/B/C) que reflete o quão dominante ela é no jogo organizado.
//
// COMO ATUALIZAR (admin): basta editar este arquivo. As chaves são o NOME da peça
// normalizado (minúsculas, sem espaços/hífens). Adicione/edite entradas conforme
// o meta evolui — combos novos aparecem em torneios o tempo todo.
//
// Peças sem entrada aqui simplesmente não recebem bônus de meta (neutras) — a
// análise continua usando stats + win rate da comunidade normalmente.
// ─────────────────────────────────────────────────────────────────────────────

export type MetaTier = "S" | "A" | "B" | "C";

export const META_TIER_SCORE: Record<MetaTier, number> = {
  S: 100, // dominante / staple de torneio
  A: 80, // muito forte, aparece bastante
  B: 60, // viável
  C: 40, // raramente competitivo
};

export const META_TIER_LABEL: Record<MetaTier, string> = {
  S: "Tier S — dominante no meta",
  A: "Tier A — muito forte",
  B: "Tier B — viável",
  C: "Tier C — pouco competitivo",
};

export type MetaEntry = { tier: MetaTier; note?: string };

// Normaliza o nome para casar com nomes do banco mesmo com variações de
// espaço/hífen/maiúscula.
export function normalizePartName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Dataset curado. Chave = normalizePartName(nome da peça).
const RAW_META: Record<string, MetaEntry> = {
  // ── BLADES (BX/UX) ──────────────────────────────────────────────────────
  dranbuster: { tier: "S", note: "Atacante dominante, staple de torneio" },
  wizardrod: { tier: "S", note: "Stamina top-tier, extremamente consistente" },
  phoenixwing: { tier: "S", note: "Balance/stamina de elite" },
  hellschain: { tier: "S", note: "Defesa/peso, vence por desgaste" },
  leonclaw: { tier: "S", note: "Atacante e balance de alto nível" },
  yelldiabolos: { tier: "S", note: "Stamina/balance, meta UX" },
  cobaltdrake: { tier: "A", note: "Atacante forte" },
  cobaltdragoon: { tier: "A", note: "Versátil, bom em vários bits" },
  sharkedge: { tier: "A", note: "Atacante clássico, ainda relevante" },
  hellsscythe: { tier: "A", note: "Stamina/balance consistente" },
  wizardarrow: { tier: "A", note: "Stamina sólida" },
  knightshield: { tier: "A", note: "Defesa de referência" },
  tyrannobeat: { tier: "A", note: "Atacante pesado" },
  phoenixfeather: { tier: "A" },
  aeropegasus: { tier: "A", note: "Atacante ágil" },
  drandagger: { tier: "B" },
  dransword: { tier: "B", note: "Atacante de entrada" },
  knightlance: { tier: "B" },
  vipertail: { tier: "B" },
  weisstiger: { tier: "B" },
  whalewave: { tier: "B", note: "Defesa/stamina" },
  sphinxcowl: { tier: "B", note: "Defesa" },
  crococrunch: { tier: "B" },
  unicornsting: { tier: "B" },
  blackshell: { tier: "B", note: "Defesa" },
  rhinohorn: { tier: "C" },
  samuraisaber: { tier: "C" },

  // ── RATCHETS ────────────────────────────────────────────────────────────
  "360": { tier: "S", note: "Ratchet de ataque padrão do meta" },
  "960": { tier: "S", note: "Altura/peso ideais, muito usado" },
  "160": { tier: "A", note: "Baixo, agressivo" },
  "460": { tier: "A" },
  "560": { tier: "A" },
  "970": { tier: "A", note: "Mais alto, bom p/ stamina" },
  "380": { tier: "A", note: "Alto, stamina/defesa" },
  "180": { tier: "B" },
  "260": { tier: "B" },
  "470": { tier: "B" },
  "770": { tier: "B" },
  m85: { tier: "B", note: "Muito alto, nicho de stamina" },

  // ── BITS ────────────────────────────────────────────────────────────────
  flat: { tier: "S", note: "Ataque agressivo, staple" },
  lowflat: { tier: "S", note: "Ataque extremo" },
  rush: { tier: "S", note: "Ataque com burst control" },
  accel: { tier: "A", note: "Ataque rápido" },
  ball: { tier: "A", note: "Defesa/stamina confiável" },
  needle: { tier: "A", note: "Stamina/defesa" },
  orb: { tier: "A", note: "Stamina" },
  point: { tier: "A", note: "Stamina/defesa" },
  taper: { tier: "B" },
  gearball: { tier: "A", note: "Stamina com gear" },
  gearflat: { tier: "A", note: "Ataque com gear" },
  gearneedle: { tier: "B" },
  gearrush: { tier: "A" },
  hexa: { tier: "B", note: "Defesa" },
  cyclone: { tier: "B" },
  freeball: { tier: "A", note: "Stamina (free spinning)" },
  discball: { tier: "B" },
  highneedle: { tier: "B" },
  spike: { tier: "C" },
  glide: { tier: "B" },
  vortex: { tier: "B" },
  quake: { tier: "C" },
  boundspike: { tier: "C" },
  transpoint: { tier: "B" },
  unite: { tier: "B" },
  kick: { tier: "C" },
  dot: { tier: "C" },
  level: { tier: "C" },
};

export function metaForPart(name: string | null | undefined): MetaEntry | null {
  if (!name) return null;
  return RAW_META[normalizePartName(name)] ?? null;
}
