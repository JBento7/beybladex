// Pesos de referência (em gramas) das peças de Beyblade X / UX / CX.
//
// Valores compilados a partir de fontes públicas da comunidade (Beyblade Wiki,
// Beyblade X Database). São apenas valores de referência para pré-preencher o
// campo de peso — cada peça continua editável no painel administrativo, já que
// moldes diferentes podem variar alguns décimos de grama.

// A chave é o nome da peça normalizado (sem acentos, sem espaços, minúsculo).
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Pesos por nome de peça. Onde uma faixa é documentada, usamos o valor médio.
const RAW_WEIGHTS: Record<string, number> = {
  // ── Blades (linha BX) ──
  "Dran Sword": 35.3,
  "Hells Scythe": 33,
  "Wizard Arrow": 35.5,
  "Knight Shield": 36.5,
  "Knight Lance": 38,
  "Shark Edge": 33,
  "Leon Claw": 36,
  "Viper Tail": 36,
  "Rhino Horn": 37,
  "Dran Dagger": 36,
  "Hells Hammer": 37,
  "Sphinx Cowl": 37,
  "Weiss Tiger": 36,
  "Unicorn Sting": 36,
  "Bear Scratch": 35,
  "Croc Crunch": 37,
  "Tyranno Beat": 37,
  "Cobalt Drake": 38,
  "Black Shell": 38,
  "Talon Ptera": 35,

  // ── Blades (linha UX — com armação metálica, mais pesadas) ──
  "Dran Buster": 47,
  "Hells Chain": 48,
  "Wizard Rod": 35.5,
  "Phoenix Wing": 39,
  "Cobalt Dragoon": 39,
  "Silver Wolf": 44,
  "Scorpio Spear": 49.2,
  "Aero Pegasus": 38,
  "Whale Wave": 40,
  "Phoenix Feather": 39,

  // ── Ratchets ──
  "1-60": 6.4,
  "2-60": 6.5,
  "3-60": 6.4,
  "3-80": 6.9,
  "4-60": 6.5,
  "4-70": 6.7,
  "4-80": 7.0,
  "5-60": 6.6,
  "5-70": 6.8,
  "5-80": 7.1,
  "9-60": 6.2,
  "9-80": 6.9,
  "0-70": 6.7,
  "7-60": 6.6,
  "M-85": 7.4,

  // ── Bits (peças pequenas) ──
  "Flat": 2.0,
  "Ball": 2.4,
  "Needle": 2.2,
  "Point": 2.3,
  "Taper": 2.3,
  "Orb": 2.5,
  "Low Flat": 2.1,
  "Rush": 2.2,
  "High Taper": 2.4,
  "Spike": 2.2,
  "Gear Flat": 3.2,
  "Gear Ball": 3.4,
  "Gear Needle": 3.3,
  "Hexa": 2.4,
  "Dot": 2.2,
  "Cyclone": 2.5,
  "Free Ball": 2.6,
  "Trans Point": 2.4,
  "Quake": 2.6,
  "Under Flat": 2.5,
  "Disc Ball": 2.6,
  "Vortex": 2.5,
};

const WEIGHTS: Record<string, number> = Object.fromEntries(
  Object.entries(RAW_WEIGHTS).map(([name, w]) => [normalize(name), w])
);

// Retorna o peso de referência de uma peça pelo nome, ou null se desconhecido.
export function lookupPartWeight(name: string | null | undefined): number | null {
  if (!name) return null;
  return WEIGHTS[normalize(name)] ?? null;
}
