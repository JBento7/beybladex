// Sample data for the layout preview (docs/EDITOR-LAYOUT.md §6). Builds the
// same objects the telão receives from /api/arena, from editable values —
// nothing here reads or writes real profiles, matches or events.
import type { ArenaData, FinishCounts, Match } from "@/components/arena/Boards";

export type Sample = {
  name1: string;
  name2: string;
  photos: boolean;
  score1: number;
  score2: number;
  sets1: number;
  sets2: number;
  setsToWin: 1 | 2;
  deck: "solo" | "3on3" | "3on3+1";
  finishes: "variados" | "nenhum" | "spin" | "todos";
  bey1: string;
  bey2: string;
  event: string;
  phase: string;
};

export const BASE_SAMPLE: Sample = {
  name1: "JOGADOR", name2: "ADVERSÁRIO", photos: true, score1: 3, score2: 1, sets1: 1, sets2: 0, setsToWin: 2,
  deck: "solo", finishes: "variados", bey1: "Dranzer", bey2: "Pegasus", event: "Campeonato LBL", phase: "Suíço — Rodada 1",
};

export const SCENARIOS: { key: string; label: string; patch: Partial<Sample> }[] = [
  { key: "curtos", label: "Nomes curtos", patch: { name1: "Ana", name2: "Rui" } },
  { key: "longos", label: "Nomes longos", patch: { name1: "Maximiliano Bartolomeu de Albuquerque", name2: "Anastácia Valquíria Montenegro" } },
  { key: "semfoto", label: "Jogadores sem foto", patch: { photos: false } },
  { key: "dois", label: "Placar com dois dígitos", patch: { score1: 12, score2: 10 } },
  { key: "unico", label: "Set único", patch: { setsToWin: 1, sets1: 0, sets2: 0 } },
  { key: "md3", label: "Melhor de três", patch: { setsToWin: 2, sets1: 1, sets2: 1 } },
  { key: "3on3", label: "Deck 3on3", patch: { deck: "3on3" } },
  { key: "3on3r", label: "Deck 3on3 + reserva", patch: { deck: "3on3+1" } },
  { key: "fin-nenhum", label: "Finishes: nenhum", patch: { finishes: "nenhum" } },
  { key: "fin-spin", label: "Finishes: só Spin", patch: { finishes: "spin" } },
  { key: "fin-todos", label: "Finishes: todos os tipos", patch: { finishes: "todos" } },
];

const counts = (s: number, o: number, b: number, x: number): FinishCounts => ({ SPIN: s, OVER: o, BURST: b, EXTREME: x });

function finishesFor(kind: Sample["finishes"], sets: number) {
  const per = kind === "nenhum" ? null : kind === "spin" ? counts(2, 0, 0, 0) : kind === "todos" ? counts(1, 1, 1, 1) : counts(1, 0, 1, 0);
  const second = kind === "variados" ? counts(0, 0, 0, 1) : per;
  const bySet = per ? Array.from({ length: Math.max(1, sets) }, (_, i) => ({ setNumber: i + 1, counts: i === 0 ? per : second ?? per })) : [];
  const flat = bySet.reduce((a, g) => counts(a.SPIN + g.counts.SPIN, a.OVER + g.counts.OVER, a.BURST + g.counts.BURST, a.EXTREME + g.counts.EXTREME), counts(0, 0, 0, 0));
  return { bySet, flat };
}

/** ArenaData + Match for the shared boards, from the sample values. */
export function buildPreview(s: Sample, profile: { avatar: string | null; deck: (string | null)[] }): { data: ArenaData; match: Match } {
  const maxSets = s.setsToWin * 2 - 1;
  const currentSetNum = Math.min(maxSets, s.sets1 + s.sets2 + 1);
  const f1 = finishesFor(s.finishes, currentSetNum);
  const f2 = finishesFor(s.finishes === "variados" ? "spin" : s.finishes, Math.max(1, currentSetNum - 1));
  const bey = profile.deck.find(Boolean) ?? "/bey-removebg-preview.png";
  const slot = (i: number) => ({ img: profile.deck[i] || bey, pieces: null });
  const deckSlots = s.deck === "solo" ? [{ img: null, pieces: null }, slot(0), { img: null, pieces: null }] : [slot(0), slot(1), slot(2)];
  const match: Match = {
    player1: s.name1, player2: s.name2, p1Id: "amostra-1", p2Id: "amostra-2",
    p1Avatar: s.photos ? profile.avatar : null, p2Avatar: s.photos ? profile.avatar : null,
    p1Sets: s.sets1, p2Sets: s.sets2, setsToWin: s.setsToWin, pointsToWinSet: 4, maxSets, currentSetNum,
    p1Points: s.score1, p2Points: s.score2, isDeck: s.deck !== "solo", currentSetBattleCount: 2,
    p1ActiveBey: s.bey1, p2ActiveBey: s.bey2, p1Combo: null, p2Combo: null,
    p1BeyImg: bey, p2BeyImg: bey, p1BeyPieces: null, p2BeyPieces: null,
    p1Finishes: f1.flat, p2Finishes: f2.flat, p1FinishesBySet: f1.bySet, p2FinishesBySet: f2.bySet,
    p1TotalPoints: s.score1 + 4 * s.sets1, p2TotalPoints: s.score2 + 4 * s.sets2, p1Deck: deckSlots, p2Deck: deckSlots,
  };
  const data: ArenaData = {
    arena: 1, status: "live", matchId: "amostra", scoreVersion: 0, phase: s.phase, sides: { left: "B", right: "X" },
    tournamentName: s.event, location: "Londrina/PR", matchNumber: 3, matchesTotal: 8, round: 1, countdown: null, history: [], match,
  };
  return { data, match };
}
