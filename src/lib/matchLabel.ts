// Labels shared by the judge panel and the telão (docs/JUIZ-TELAO.md).
// No imports: unit-tested directly by Node (tests/matchLabel.test.ts).

export const FINISH_LABELS: Record<string, string> = {
  SPIN_FINISH: "Spin Finish",
  OVER_FINISH: "Over Finish",
  BURST_FINISH: "Burst Finish",
  EXTREME_FINISH: "Xtreme Finish",
  MISSLAUNCH: "Misslaunch",
};

/**
 * Phase of a match: "Suíço — Rodada 3", "Semifinal", "Final", "Disputa de 3º
 * lugar", "Quartas de final"…  `roundSize` = real matches (no byes, no 3rd
 * place) in that round, which names a knockout round.
 */
export function matchPhaseLabel(m: {
  format: string;
  round: number;
  swissRounds?: number | null;
  isThirdPlace?: boolean;
  roundSize?: number;
}): string {
  const swiss = m.format === "ROUND_ROBIN" || m.format === "SWISS";
  if (swiss && (!m.swissRounds || m.round <= m.swissRounds)) return `Suíço — Rodada ${m.round}`;
  if (m.format === "GROUPS") return `Grupos — Rodada ${m.round}`;
  if (m.isThirdPlace) return "Disputa de 3º lugar";
  switch (m.roundSize) {
    case 1: return "Final";
    case 2: return "Semifinal";
    case 4: return "Quartas de final";
    case 8: return "Oitavas de final";
    default: {
      const ko = swiss && m.swissRounds ? m.round - m.swissRounds : m.round;
      return `Mata-mata — Rodada ${ko}`;
    }
  }
}

/** "Set 1 de até 3" (best of 3) or "Set único". */
export function setLabel(setNumber: number, setsToWin: number): string {
  const max = setsToWin * 2 - 1;
  return max <= 1 ? "Set único" : `Set ${setNumber} de até ${max}`;
}

/** Judge header: "Arena 2 · Suíço — Rodada 3 · Set 1 de até 3". */
export function judgeHeader(m: { arena: number | null | undefined; phase: string; setNumber: number; setsToWin: number }): string {
  return [m.arena ? `Arena ${m.arena}` : null, m.phase, setLabel(m.setNumber, m.setsToWin)].filter(Boolean).join(" · ");
}

/** "João · Burst Finish · +2 · Set 1". */
export function launchText(l: { playerName: string; finishType: string; points: number; setNumber: number | null }): string {
  return [l.playerName, FINISH_LABELS[l.finishType] ?? l.finishType, `+${l.points}`, l.setNumber ? `Set ${l.setNumber}` : null].filter(Boolean).join(" · ");
}
