// Pesos de referência (em gramas) das peças de Beyblade X / UX / CX.
//
// Fonte: planilha oficial da comunidade fornecida pelo organizador
// (coluna MASSA). Valores usados para pré-preencher o campo de peso —
// cada peça continua editável no painel administrativo.

// A chave é o nome da peça normalizado (sem acentos, sem espaços, minúsculo).
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Pesos por nome de peça (gramas), conforme a planilha.
const RAW_WEIGHTS: Record<string, number> = {
  // ── Blades (BX / UX) ──
  "Dran Sword": 34.63,
  "Hells Scythe": 32.95,
  "Wizard Arrow": 31.62,
  "Knight Shield": 32.4,
  "Knight Lance": 32.32,
  "Shark Edge": 34.26,
  "Leon Claw": 31.28,
  "Rhino Horn": 32.8,
  "Dran Dagger": 34.89,
  "Hells Chain": 33.31,
  "Phoenix Wing": 37.74,
  "Roar Tyranno": 36.56,
  "Unicorn Sting": 33.11,
  "Hells Hammer": 33.04,
  "Wizard Rod": 35.56,
  "Tyranno Beat": 36.88,
  "Weiss Tiger": 34.73,
  "Cobalt Dragoon": 37.6,
  "Black Shell": 32.42,
  "Leon Crest": 34.74,
  "Whale Wave": 38.04,
  "Silver Wolf": 36.73,
  "Knight Mail": 36.7,
  "Ptera Swing": 34.49,
  "Crimson Garuda": 35.05,
  "Samurai Saber": 36.13,
  "Impact Drake": 37.93,
  "Shinobi Knife": 30.86,
  "Mammoth Tusk": 32.27,

  // ── CX Main Blades ──
  "Brave": 31.05,
  "Arc": 29.25,
  "Dark": 30.34,
  "Reaper": 29.03,

  // ── CX Lock Chips ──
  "Dran": 1.73,
  "Wizard": 1.73,
  "Perseus": 1.73,
  "Hells": 1.73,
  "Rhino": 1.73,
  "Leon": 1.73,
  "Pegasus": 1.73,
  "Cerberus": 1.73,
  "Whale": 1.73,

  // ── Ratchets ──
  "1-60": 5.95,
  "2-60": 6.19,
  "2-70": 6.33,
  "3-60": 6.19,
  "3-70": 6.47,
  "3-80": 7.1,
  "3-85": 4.74,
  "4-55": 4.73,
  "4-60": 6.24,
  "4-70": 6.38,
  "4-80": 6.87,
  "5-60": 6.55,
  "5-80": 7.27,
  "6-60": 6.09,
  "6-80": 6.89,
  "7-60": 7.09,
  "7-70": 7.29,
  "9-60": 6.1,
  "0-70": 7.01,

  // ── Bits (nome completo) ──
  "Flat": 2.19,
  "Taper": 2.19,
  "Ball": 2.03,
  "Needle": 1.97,
  "Low Flat": 2.13,
  "Point": 2.19,
  "Orb": 1.97,
  "Rush": 2.03,
  "High Taper": 2.3,
  "Spike": 1.94,
  "Gear Flat": 2.26,
  "Gear Point": 2.26,
  "Gear Needle": 2,
  "Disc Ball": 3.22,
  "Hexa": 2.62,
  "Metal Needle": 2.84,
  "Unite": 2.14,
  "Cyclone": 2.13,
  "Dot": 2,
  "Elevate": 3.27,
  "Free Ball": 1.95,
  "Level": 2.67,
  "Trans Point": 2.2,
  "Low Rush": 1.94,
  "Vortex": 2.16,
  "Low Orb": 1.88,
  "Wedge": 1.87,
  "Kick": 2.2,
  "Zap": 2.53,
  "Slash": 4.63,
  "Round": 4.67,
  "Bumper": 5.15,
  "Turn": 5.8,
};

// Siglas dos bits → peso (para combos que guardam o bit pela sigla, ex: "LR", "K").
// Para siglas de uma letra que se repetem entre linhas de bits, usamos o bit
// da linha básica (mais comum em combos).
const BIT_SIGLA_WEIGHTS: Record<string, number> = {
  F: 2.19,   // Flat
  T: 2.19,   // Taper
  B: 2.03,   // Ball
  N: 1.97,   // Needle
  LF: 2.13,  // Low Flat
  P: 2.19,   // Point
  O: 1.97,   // Orb
  R: 2.03,   // Rush
  HT: 2.3,   // High Taper
  S: 1.94,   // Spike
  GF: 2.26,  // Gear Flat
  GP: 2.26,  // Gear Point
  GN: 2,     // Gear Needle
  DB: 3.22,  // Disc Ball
  H: 2.62,   // Hexa
  MN: 2.84,  // Metal Needle
  U: 2.14,   // Unite
  C: 2.13,   // Cyclone
  D: 2,      // Dot
  E: 3.27,   // Elevate
  FB: 1.95,  // Free Ball
  L: 2.67,   // Level
  TP: 2.2,   // Trans Point
  LR: 1.94,  // Low Rush
  V: 2.16,   // Vortex
  LO: 1.88,  // Low Orb
  W: 1.87,   // Wedge
  K: 2.2,    // Kick
  Z: 2.53,   // Zap
};

const WEIGHTS: Record<string, number> = {
  ...Object.fromEntries(
    Object.entries(RAW_WEIGHTS).map(([name, w]) => [normalize(name), w])
  ),
  // Siglas têm prioridade menor: só preenchem se o nome normalizado não colidir.
  ...Object.fromEntries(
    Object.entries(BIT_SIGLA_WEIGHTS).map(([sig, w]) => [normalize(sig), w])
  ),
};

// Retorna o peso de referência de uma peça pelo nome (ou sigla), ou null.
export function lookupPartWeight(name: string | null | undefined): number | null {
  if (!name) return null;
  return WEIGHTS[normalize(name)] ?? null;
}
