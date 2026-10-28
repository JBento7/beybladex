// Swiss core — pure functions only (no database, no imports), unit-tested in
// tests/swiss-*.test.ts. The engine (lib/tournament-engine.ts) feeds them data
// read inside a locked transaction and writes what they return.
//
// Published rules (version SWISS_RULES_VERSION):
//  - Win 1 Swiss point · loss 0 · bye 1 (a bye is NOT a played match and gives
//    no battle points). A W.O. is a played-match win for the opponent.
//  - Ordering (lib/standings.compareSwissRows): Swiss points → battle points →
//    balance → nickname A→Z → id.
//  - Pairing priorities: (1) everyone eligible gets exactly one participation;
//    (2) no rematches; (3) fewest pairings across score groups; (4) smallest
//    point gap in those; (5) deterministic tie-break (Dutch-style: top half of
//    a score group against its bottom half).
//  - Bye (odd field): fewest previous byes first, then lowest standing, and
//    only if the rest of the field can still be paired validly.

export const SWISS_RULES_VERSION = "suico-v2";

/** Both stored formats mean "Suíço" and use the same engine. */
export function isSwissFormat(format: string | null | undefined): boolean {
  return format === "ROUND_ROBIN" || format === "SWISS";
}

export type Phase = "SWISS" | "KNOCKOUT";
export function phaseOf(round: number, swissRounds: number): Phase {
  return round <= swissRounds ? "SWISS" : "KNOCKOUT";
}

export function swissRoundCount(participantCount: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, participantCount))));
}

// ── Seeded randomness (round 1) ──────────────────────────────────────────────

/** mulberry32: tiny deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with a seed; input is sorted by id first so the result depends only on (ids, seed). */
export function seededShuffle<T extends { id: string }>(items: T[], seed: number): T[] {
  const out = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Pairing ──────────────────────────────────────────────────────────────────

export type PairingPlayer = {
  id: string;
  /** Swiss points before this round. */
  points: number;
};

export type PairingInput = {
  /** Eligible players ALREADY ordered by the standings (best first). Round 1: any order (shuffled with `seed`). */
  players: PairingPlayer[];
  /** Real opponents already faced (byes excluded). */
  opponents: Map<string, Set<string>> | Record<string, string[]>;
  /** Swiss byes already received. */
  byeCounts?: Map<string, number> | Record<string, number>;
  round: number;
  /** Round 1 draw seed (recorded). */
  seed?: number;
  /** Explicit administrative exception: allow rematches when no valid round exists. */
  allowRematches?: boolean;
  /** Search budget (nodes) per matching attempt. */
  nodeBudget?: number;
};

export type Pair = { player1Id: string; player2Id: string };
export type Crossing = { player1Id: string; player2Id: string; points1: number; points2: number };

export type PairingResult =
  | {
      status: "ok";
      pairs: Pair[];
      byeId: string | null;
      crossings: Crossing[];
      rematches: Pair[];
      /** false = the search budget ran out after a valid round was found; it
       *  satisfies every hard rule but a better arrangement may exist. */
      optimal: boolean;
      seed: number | null;
      notes: string[];
    }
  | {
      /** "impossible" = proven: no round without rematches exists.
       *  "limit" = the search budget ran out before finding one (NOT a proof). */
      status: "impossible" | "limit";
      seed: number | null;
      notes: string[];
    };

const W_REMATCH = 1e9;
const W_CROSS = 1e6;
const W_GAP = 1e3;

function setOf(src: PairingInput["opponents"], id: string): Set<string> {
  if (src instanceof Map) return src.get(id) ?? new Set();
  return new Set(src[id] ?? []);
}
function countOf(src: PairingInput["byeCounts"], id: string): number {
  if (!src) return 0;
  return src instanceof Map ? src.get(id) ?? 0 : src[id] ?? 0;
}

type MatchOutcome = { pairs: [number, number][] | null; cost: number; complete: boolean };

/**
 * Minimum-cost perfect matching by branch-and-bound with an explicit node
 * budget. `cost[i][j] = Infinity` forbids the pair. Returns the best matching
 * found and whether the search finished (complete=true ⇒ it is optimal, and a
 * null result is a proof that no valid matching exists).
 */
function minCostMatching(cost: number[][], budget: number): MatchOutcome {
  const n = cost.length;
  const paired = new Array<boolean>(n).fill(false);
  const minEdge = cost.map((row, i) => Math.min(...row.filter((_, j) => j !== i)));
  let best: [number, number][] | null = null;
  let bestCost = Infinity;
  let nodes = 0;
  let aborted = false;
  const stack: [number, number][] = [];

  const rec = (acc: number, left: number) => {
    if (aborted) return;
    if (++nodes > budget) { aborted = true; return; }
    if (left === 0) {
      if (acc < bestCost) { bestCost = acc; best = [...stack]; }
      return;
    }
    // Most constrained unpaired player first (fewest allowed partners).
    let pick = -1, pickOptions = Infinity;
    let lb = 0;
    for (let i = 0; i < n; i++) {
      if (paired[i]) continue;
      let opts = 0;
      for (let j = 0; j < n; j++) if (j !== i && !paired[j] && cost[i][j] < Infinity) opts++;
      if (opts === 0) return; // dead end
      if (opts < pickOptions) { pickOptions = opts; pick = i; }
      lb += minEdge[i];
    }
    if (acc + lb / 2 >= bestCost) return;
    paired[pick] = true;
    const cand: number[] = [];
    for (let j = 0; j < n; j++) if (!paired[j] && cost[pick][j] < Infinity) cand.push(j);
    cand.sort((a, b) => cost[pick][a] - cost[pick][b] || a - b);
    for (const j of cand) {
      if (acc + cost[pick][j] >= bestCost) break;
      paired[j] = true;
      stack.push(pick < j ? [pick, j] : [j, pick]);
      rec(acc + cost[pick][j], left - 2);
      stack.pop();
      paired[j] = false;
      if (aborted) break;
    }
    paired[pick] = false;
  };
  rec(0, n);
  return { pairs: best, cost: bestCost, complete: !aborted };
}

/** Cost matrix for an ordered list of players. */
function buildCost(players: PairingPlayer[], opponents: PairingInput["opponents"], allowRematches: boolean): number[][] {
  const n = players.length;
  // Position of each player inside its score group (for the Dutch tie-break).
  const groupPos = new Map<string, { pos: number; size: number }>();
  const groups = new Map<number, string[]>();
  for (const p of players) groups.set(p.points, [...(groups.get(p.points) ?? []), p.id]);
  for (const ids of groups.values()) ids.forEach((id, pos) => groupPos.set(id, { pos, size: ids.length }));

  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  for (let i = 0; i < n; i++) {
    const faced = setOf(opponents, players[i].id);
    for (let j = i + 1; j < n; j++) {
      const a = players[i], b = players[j];
      const rematch = faced.has(b.id) || setOf(opponents, b.id).has(a.id);
      if (rematch && !allowRematches) continue;
      let c = rematch ? W_REMATCH : 0;
      if (a.points !== b.points) {
        c += W_CROSS + Math.abs(a.points - b.points) * W_GAP + Math.abs(i - j);
      } else {
        const ga = groupPos.get(a.id)!, gb = groupPos.get(b.id)!;
        // Ideal partner sits half a group below (1st vs (g/2+1)th...).
        c += Math.abs(Math.abs(ga.pos - gb.pos) - Math.floor(ga.size / 2));
      }
      m[i][j] = m[j][i] = c;
    }
  }
  return m;
}

/**
 * Pairs one Swiss round. Never returns a partial round: either every eligible
 * player gets exactly one participation (a pair or the single bye), or a
 * diagnostic explaining why no valid round could be built.
 */
export function pairSwissRound(input: PairingInput): PairingResult {
  const budget = input.nodeBudget ?? 200_000;
  const allow = !!input.allowRematches;
  const notes: string[] = [];
  let seed: number | null = null;

  // Round 1: reproducible draw.
  let players = input.players;
  if (input.round === 1) {
    seed = input.seed ?? 1;
    players = seededShuffle(players, seed);
    notes.push(`Rodada 1: sorteio com semente ${seed}.`);
  }
  // Duplicate ids would break "exactly one participation".
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    return { status: "impossible", seed, notes: [...notes, "Jogador repetido na lista de elegíveis."] };
  }
  if (players.length < 2) {
    return { status: "impossible", seed, notes: [...notes, "Menos de 2 jogadores elegíveis."] };
  }

  const solve = (pool: PairingPlayer[]) => {
    const cost = buildCost(pool, input.opponents, allow);
    return { pool, out: minCostMatching(cost, budget), cost };
  };

  let byeId: string | null = null;
  let chosen: ReturnType<typeof solve> | null = null;
  let anyLimit = false;

  if (players.length % 2 === 1) {
    // Candidates: fewest previous byes, then lowest standing (last in order).
    const order = players
      .map((p, idx) => ({ p, idx }))
      .sort((a, b) => countOf(input.byeCounts, a.p.id) - countOf(input.byeCounts, b.p.id) || b.idx - a.idx);
    for (const { p } of order) {
      const res = solve(players.filter((x) => x.id !== p.id));
      if (res.out.pairs) {
        byeId = p.id;
        chosen = res;
        if (countOf(input.byeCounts, p.id) > 0) notes.push(`Bye repetido para ${p.id}: todos os elegíveis viáveis já tinham recebido bye.`);
        break;
      }
      if (!res.out.complete) anyLimit = true;
      notes.push(`Bye não atribuído a ${p.id}: o restante não pode ser pareado ${res.out.complete ? "sem reencontro" : "dentro do limite de busca"}.`);
    }
  } else {
    chosen = solve(players);
    if (!chosen.out.pairs && !chosen.out.complete) anyLimit = true;
  }

  if (!chosen || !chosen.out.pairs) {
    return {
      status: anyLimit ? "limit" : "impossible",
      seed,
      notes: [
        ...notes,
        anyLimit
          ? "Limite de busca atingido antes de encontrar uma rodada válida. Isso não prova que ela não exista."
          : "Não existe rodada sem reencontro para estes jogadores.",
      ],
    };
  }

  const pool = chosen.pool;
  const pairs: Pair[] = chosen.out.pairs.map(([i, j]) => ({ player1Id: pool[i].id, player2Id: pool[j].id }));
  // Stable presentation: by the better-ranked player of each pair.
  const rank = new Map(pool.map((p, i) => [p.id, i]));
  pairs.sort((a, b) => Math.min(rank.get(a.player1Id)!, rank.get(a.player2Id)!) - Math.min(rank.get(b.player1Id)!, rank.get(b.player2Id)!));
  const pts = new Map(pool.map((p) => [p.id, p.points]));
  const crossings = pairs
    .filter((p) => pts.get(p.player1Id) !== pts.get(p.player2Id))
    .map((p) => ({ player1Id: p.player1Id, player2Id: p.player2Id, points1: pts.get(p.player1Id)!, points2: pts.get(p.player2Id)! }));
  const rematches = pairs.filter((p) => setOf(input.opponents, p.player1Id).has(p.player2Id) || setOf(input.opponents, p.player2Id).has(p.player1Id));
  if (rematches.length) notes.push(`Exceção administrativa: ${rematches.length} reencontro(s) permitido(s).`);
  if (!chosen.out.complete) notes.push("Limite de busca atingido após encontrar uma rodada válida: regras respeitadas, mas a otimização não foi comprovada.");
  return { status: "ok", pairs, byeId, crossings, rematches, optimal: chosen.out.complete, seed, notes };
}

// ── Integrity ────────────────────────────────────────────────────────────────

export type AuditMatch = {
  id: string;
  round: number;
  status: string;
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  isWalkover?: boolean;
  isThirdPlace?: boolean;
  arena?: number | null;
  slot?: number | null;
  createdAt?: string | Date;
};

export type IntegrityIssue = {
  code:
    | "DUPLICATE_PARTICIPATION" | "INVALID_BYE" | "WINNER_NOT_IN_MATCH" | "FINISHED_WITHOUT_WINNER"
    | "MISSING_PARTICIPATION" | "NOT_A_PARTICIPANT" | "PENDING_IN_FINISHED" | "SCHEDULE_COLLISION"
    | "CUT_LARGER_THAN_FIELD" | "KNOCKOUT_SIZE";
  /** "bloqueante" stops advancing, cutting to the knockout, finishing and ranking. */
  severity: "bloqueante" | "aviso";
  round?: number;
  userId?: string;
  matchIds: string[];
  message: string;
};

/**
 * Read-only integrity audit of a Swiss tournament (Swiss rounds + knockout
 * structure). Never decides which record "counts" and never deletes anything:
 * it only reports, so an organizer can decide.
 */
export function auditSwiss(input: {
  matches: AuditMatch[];
  swissRounds: number;
  participants: string[]; // approved user ids
  tournamentStatus: string;
  qualifiers?: number | null;
}): IntegrityIssue[] {
  const { matches, swissRounds, tournamentStatus, qualifiers } = input;
  const part = new Set(input.participants);
  const issues: IntegrityIssue[] = [];
  const swiss = matches.filter((m) => m.round <= swissRounds && !m.isThirdPlace);
  const rounds = [...new Set(swiss.map((m) => m.round))].sort((a, b) => a - b);

  for (const r of rounds) {
    const rm = swiss.filter((m) => m.round === r);
    const seen = new Map<string, string[]>();
    for (const m of rm) {
      const ids = m.player1Id === m.player2Id ? [m.player1Id] : [m.player1Id, m.player2Id];
      for (const id of ids) seen.set(id, [...(seen.get(id) ?? []), m.id]);
      if (m.player1Id === m.player2Id && !m.isWalkover) {
        issues.push({ code: "INVALID_BYE", severity: "bloqueante", round: r, userId: m.player1Id, matchIds: [m.id], message: `Rodada ${r}: partida do jogador contra ele mesmo sem marcação de bye.` });
      }
      if (m.winnerId && m.winnerId !== m.player1Id && m.winnerId !== m.player2Id) {
        issues.push({ code: "WINNER_NOT_IN_MATCH", severity: "bloqueante", round: r, matchIds: [m.id], message: `Rodada ${r}: vencedor registrado não pertence à partida.` });
      }
      if (m.status === "FINISHED" && !m.winnerId) {
        issues.push({ code: "FINISHED_WITHOUT_WINNER", severity: "bloqueante", round: r, matchIds: [m.id], message: `Rodada ${r}: partida encerrada sem vencedor.` });
      }
      for (const id of ids) {
        if (!part.has(id)) issues.push({ code: "NOT_A_PARTICIPANT", severity: "aviso", round: r, userId: id, matchIds: [m.id], message: `Rodada ${r}: jogador fora da lista de participantes aprovados.` });
      }
      if (tournamentStatus === "FINISHED" && m.status !== "FINISHED") {
        issues.push({ code: "PENDING_IN_FINISHED", severity: "aviso", round: r, matchIds: [m.id], message: `Rodada ${r}: partida pendente em torneio finalizado.` });
      }
    }
    for (const [id, ms] of seen) {
      if (ms.length > 1) {
        issues.push({ code: "DUPLICATE_PARTICIPATION", severity: "bloqueante", round: r, userId: id, matchIds: ms, message: `Rodada ${r}: jogador com ${ms.length} participações (máximo 1).` });
      }
    }
    // Present in other Swiss rounds but absent here: missing participation.
    for (const id of part) {
      if (seen.has(id)) continue;
      const elsewhere = swiss.some((m) => m.round !== r && (m.player1Id === id || m.player2Id === id));
      if (elsewhere) issues.push({ code: "MISSING_PARTICIPATION", severity: "aviso", round: r, userId: id, matchIds: [], message: `Rodada ${r}: jogador sem participação (ausência, entrada tardia ou erro de geração).` });
    }
    // Same arena + time slot used twice.
    const slotKey = new Map<string, string[]>();
    for (const m of rm) {
      if (m.player1Id === m.player2Id || m.arena == null || m.slot == null) continue;
      const k = `${m.arena}:${m.slot}`;
      slotKey.set(k, [...(slotKey.get(k) ?? []), m.id]);
    }
    for (const [k, ms] of slotKey) {
      if (ms.length > 1) {
        const [arena, slot] = k.split(":");
        issues.push({ code: "SCHEDULE_COLLISION", severity: "aviso", round: r, matchIds: ms, message: `Rodada ${r}: ${ms.length} partidas na arena ${arena}, horário ${Number(slot) + 1}.` });
      }
    }
  }

  // Knockout structure.
  if (qualifiers && qualifiers > part.size) {
    issues.push({ code: "CUT_LARGER_THAN_FIELD", severity: "aviso", matchIds: [], message: `Corte top ${qualifiers} com apenas ${part.size} participantes.` });
  }
  const ko = matches.filter((m) => m.round > swissRounds && m.player1Id !== m.player2Id && !m.isThirdPlace);
  if (ko.length && qualifiers) {
    const first = Math.min(...ko.map((m) => m.round));
    const firstPlayers = new Set(ko.filter((m) => m.round === first).flatMap((m) => [m.player1Id, m.player2Id])).size;
    const expected = Math.min(qualifiers, part.size);
    if (firstPlayers !== expected) {
      issues.push({ code: "KNOCKOUT_SIZE", severity: "aviso", round: first, matchIds: ko.filter((m) => m.round === first).map((m) => m.id), message: `Mata-mata começou com ${firstPlayers} jogadores; esperado ${expected}.` });
    }
  }
  if (tournamentStatus === "FINISHED") {
    for (const m of matches.filter((x) => x.round > swissRounds && x.status !== "FINISHED")) {
      issues.push({ code: "PENDING_IN_FINISHED", severity: "aviso", round: m.round, matchIds: [m.id], message: `Mata-mata: partida pendente em torneio finalizado.` });
    }
  }
  return issues;
}

export const hasBlocking = (issues: IntegrityIssue[]) => issues.some((i) => i.severity === "bloqueante");

// ── Knockout cut & seeding ───────────────────────────────────────────────────

export const ALLOWED_CUTS = [4, 8, 16] as const;

/**
 * Cut configuration against the field:
 *  - none: no knockout, finish on the Swiss standings;
 *  - partial: the top N advance; all: the cut equals the field (everyone advances);
 *  - error: unsupported value, or a cut larger than the field.
 */
export function validateCut(qualifiers: number | null | undefined, field: number):
  { mode: "none" | "partial" | "all" } | { mode: "error"; message: string } {
  if (qualifiers == null) return { mode: "none" };
  if (!(ALLOWED_CUTS as readonly number[]).includes(qualifiers)) {
    return { mode: "error", message: `Corte inválido: top ${qualifiers}. Use top 4, 8 ou 16.` };
  }
  if (qualifiers > field) {
    return { mode: "error", message: `O corte top ${qualifiers} é maior que o número de participantes aprovados (${field}). Ajuste o corte ou aprove mais jogadores antes de iniciar.` };
  }
  return { mode: qualifiers === field ? "all" : "partial" };
}

/** Standard bracket seed order: top seeds only meet late (1v8, 4v5, 2v7, 3v6 …). */
export function seedOrder(n: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < n) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) { next.push(s); next.push(sum - s); }
    seeds = next;
  }
  return seeds;
}

/** First knockout round from the seeded list (index 0 = 1st). bracketPos = position in the bracket. */
export function seededFirstRound(seeded: string[]): { player1Id: string; player2Id: string; bracketPos: number }[] {
  const order = seedOrder(seeded.length);
  const out: { player1Id: string; player2Id: string; bracketPos: number }[] = [];
  for (let i = 0; i < order.length; i += 2) {
    out.push({ player1Id: seeded[order[i] - 1], player2Id: seeded[order[i + 1] - 1], bracketPos: i / 2 + 1 });
  }
  return out;
}

/** Next knockout round: winner of bracket positions (1,2) → 1, (3,4) → 2 … — by bracketPos, never query order. */
export function nextBracketRound(prev: { bracketPos: number; winnerId: string | null }[]): { player1Id: string; player2Id: string; bracketPos: number }[] | null {
  const sorted = [...prev].sort((a, b) => a.bracketPos - b.bracketPos);
  if (sorted.some((m) => !m.winnerId)) return null;
  const out: { player1Id: string; player2Id: string; bracketPos: number }[] = [];
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    out.push({ player1Id: sorted[i].winnerId!, player2Id: sorted[i + 1].winnerId!, bracketPos: i / 2 + 1 });
  }
  return out;
}

// ── Scoring a point ──────────────────────────────────────────────────────────

export type SetState = { setNumber: number; status: "IN_PROGRESS" | "FINISHED"; player1Points: number; player2Points: number; winnerId: string | null };

/**
 * What one scored point does to a match. Pure: the API applies the result
 * inside one locked transaction. A finish may overshoot the target (4 → 5);
 * the match winner is whoever wins `setsToWin` sets, regardless of total points.
 */
export function applyPoint(input: {
  player1Id: string;
  player2Id: string;
  matchStatus: string;
  sets: SetState[];
  setsToWin: number;
  pointsToWinSet: number;
  scorerId: string;
  points: number;
}): { error: string } | {
  setNumber: number;
  newSet: boolean;
  player1Points: number;
  player2Points: number;
  setWinnerId: string | null;
  matchWinnerId: string | null;
  p1Sets: number;
  p2Sets: number;
} {
  const { player1Id, player2Id, sets, setsToWin, pointsToWinSet, scorerId, points } = input;
  if (input.matchStatus === "FINISHED") return { error: "Partida já finalizada" };
  if (scorerId !== player1Id && scorerId !== player2Id) return { error: "Jogador inválido" };
  if (!(points > 0)) return { error: "Pontuação inválida" };
  const p1Won = sets.filter((s) => s.status === "FINISHED" && s.winnerId === player1Id).length;
  const p2Won = sets.filter((s) => s.status === "FINISHED" && s.winnerId === player2Id).length;
  if (p1Won >= setsToWin || p2Won >= setsToWin) return { error: "Partida já decidida" };
  const open = sets.find((s) => s.status === "IN_PROGRESS");
  const maxSets = setsToWin * 2 - 1;
  if (!open && sets.length >= maxSets) return { error: "Número máximo de sets atingido" };
  const setNumber = open ? open.setNumber : sets.length + 1;
  const p1 = (open?.player1Points ?? 0) + (scorerId === player1Id ? points : 0);
  const p2 = (open?.player2Points ?? 0) + (scorerId === player2Id ? points : 0);
  let setWinnerId: string | null = null;
  if (p1 >= pointsToWinSet || p2 >= pointsToWinSet) setWinnerId = scorerId; // only the scorer's total moved
  const p1Sets = p1Won + (setWinnerId === player1Id ? 1 : 0);
  const p2Sets = p2Won + (setWinnerId === player2Id ? 1 : 0);
  const matchWinnerId = p1Sets >= setsToWin ? player1Id : p2Sets >= setsToWin ? player2Id : null;
  return { setNumber, newSet: !open, player1Points: p1, player2Points: p2, setWinnerId, matchWinnerId, p1Sets, p2Sets };
}

// ── Controlled repair ────────────────────────────────────────────────────────

export type RepairPlan = {
  round: number;
  /** Eligible players with no participation in this round. */
  missing: string[];
  /** Players with more than one participation (reported, never auto-fixed). */
  duplicates: { userId: string; matchIds: string[] }[];
  /** Proposed new matches — only between players MISSING from this round. */
  proposals: Pair[];
  /** Missing players that could not be paired without breaking a rule. */
  unresolved: { userId: string; reason: string }[];
  /** True when there is nothing to add (re-running a repair is a no-op). */
  noop: boolean;
};

/**
 * Plans the repair of ONE round (the round where the participation is
 * missing). Never pairs a missing player with someone who already played this
 * round, never proposes a rematch and never invents a bye: a leftover player
 * is reported for an organizer decision.
 */
export function planRoundRepair(input: {
  round: number;
  eligible: PairingPlayer[]; // ordered by standings
  roundMatches: AuditMatch[];
  opponents: PairingInput["opponents"];
}): RepairPlan {
  const { round, eligible, roundMatches } = input;
  const seen = new Map<string, string[]>();
  for (const m of roundMatches.filter((x) => x.round === round)) {
    const ids = m.player1Id === m.player2Id ? [m.player1Id] : [m.player1Id, m.player2Id];
    for (const id of ids) seen.set(id, [...(seen.get(id) ?? []), m.id]);
  }
  const duplicates = [...seen.entries()].filter(([, ms]) => ms.length > 1).map(([userId, matchIds]) => ({ userId, matchIds }));
  const missingPlayers = eligible.filter((p) => !seen.has(p.id));
  const missing = missingPlayers.map((p) => p.id);
  if (missingPlayers.length === 0) return { round, missing, duplicates, proposals: [], unresolved: [], noop: true };

  const unresolved: { userId: string; reason: string }[] = [];
  let pool = missingPlayers;
  if (pool.length % 2 === 1) {
    // Never pair with someone who already completed this round: the last
    // (lowest standing) missing player is left for an explicit decision.
    const left = pool[pool.length - 1];
    unresolved.push({ userId: left.id, reason: "Número ímpar de jogadores sem partida: exige decisão da organização (bye manual, partida fora do suíço ou ausência)." });
    pool = pool.slice(0, -1);
  }
  let proposals: Pair[] = [];
  if (pool.length >= 2) {
    const res = pairSwissRound({ players: pool, opponents: input.opponents, round: round === 1 ? 2 : round });
    if (res.status === "ok") proposals = res.pairs;
    else for (const p of pool) unresolved.push({ userId: p.id, reason: res.notes[res.notes.length - 1] });
  }
  return { round, missing, duplicates, proposals, unresolved, noop: proposals.length === 0 && unresolved.length === 0 };
}
