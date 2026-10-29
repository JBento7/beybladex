// Monthly ranking rules (docs/RANKING-MENSAL.md): calendar months of
// America/Sao_Paulo, points-per-placement tables, tiebreaks and the
// deterministic ordering. No imports: unit-tested directly by Node
// (tests/monthlyRules.test.ts).

export const RANKING_TZ = "America/Sao_Paulo";
export const DEFAULT_POINTS_TABLE: readonly number[] = [100, 70, 50, 30, 10];
export const MAX_PLACES = 32;
export const MAX_PLACE_POINTS = 10000;
export const MONTHLY_LEAGUES = ["lbl", "lbm"] as const;
export type MonthlyLeague = (typeof MONTHLY_LEAGUES)[number];

export const TIEBREAKS = {
  NICKNAME: "Apelido em ordem alfabética",
  WINS: "Mais vitórias, depois apelido",
} as const;
export type Tiebreak = keyof typeof TIEBREAKS;
export const DEFAULT_TIEBREAK: Tiebreak = "NICKNAME";

export type MonthlyRules = { pointsTable: number[]; tiebreak: Tiebreak };
export const DEFAULT_RULES: MonthlyRules = { pointsTable: [...DEFAULT_POINTS_TABLE], tiebreak: DEFAULT_TIEBREAK };

export function isMonthlyLeague(v: unknown): v is MonthlyLeague {
  return v === "lbl" || v === "lbm";
}

// ── Months ("AAAA-MM") ──

export function isMonth(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return false;
  const y = Number(v.slice(0, 4));
  return y >= 2000 && y <= 2999;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar parts of an instant in São Paulo. */
function spParts(d: Date): { y: number; m: number; day: number; h: number; min: number; s: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RANKING_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), day: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Month of an instant in São Paulo (e.g. 2026-11-01T01:00Z → "2026-10"). */
export function monthInSaoPaulo(d: Date): string {
  const p = spParts(d);
  return `${p.y}-${pad(p.m)}`;
}

export function currentMonth(now: Date = new Date()): string {
  return monthInSaoPaulo(now);
}

/**
 * Month of a tournament for the ranking. startDate is stored as the São Paulo
 * WALL time written as UTC (what the forms send), so its UTC month is the
 * calendar month. Without a date, the creation instant (a real timestamp) is
 * converted to São Paulo.
 */
export function monthOfTournament(t: { startDate: Date | null; createdAt: Date }): string {
  if (t.startDate) return `${t.startDate.getUTCFullYear()}-${pad(t.startDate.getUTCMonth() + 1)}`;
  return monthInSaoPaulo(t.createdAt);
}

export function addMonths(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${pad(mm + 1)}`;
}

/** UTC instant of São Paulo midnight on day 1 of the month. */
function spMonthStartUtc(month: string): Date {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const guess = Date.UTC(y, m - 1, 1, 0, 0, 0);
  // Offset of São Paulo at that moment (negative = behind UTC), from its wall clock.
  const p = spParts(new Date(guess));
  const asUtc = Date.UTC(p.y, p.m - 1, p.day, p.h, p.min, p.s);
  return new Date(guess - (asUtc - guess));
}

/**
 * Filters for "tournaments of this month": startDate in [day 1, next day 1) of
 * the wall clock, or no startDate and createdAt within the São Paulo month.
 */
export function monthBounds(month: string): { wallFrom: Date; wallTo: Date; instantFrom: Date; instantTo: Date } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const next = addMonths(month, 1);
  return {
    wallFrom: new Date(Date.UTC(y, m - 1, 1)),
    wallTo: new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5, 7)) - 1, 1)),
    instantFrom: spMonthStartUtc(month),
    instantTo: spMonthStartUtc(next),
  };
}

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "outubro de 2026". */
export function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;
}

// ── Rules ──

/** 1–32 placements, integers 0–10000. Returns the table or an error message. */
export function parsePointsTable(v: unknown): { ok: true; table: number[] } | { ok: false; error: string } {
  if (!Array.isArray(v) || v.length === 0) return { ok: false, error: "Informe os pontos de pelo menos uma colocação." };
  if (v.length > MAX_PLACES) return { ok: false, error: `No máximo ${MAX_PLACES} colocações.` };
  const table: number[] = [];
  for (let i = 0; i < v.length; i++) {
    const raw = v[i];
    const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > MAX_PLACE_POINTS) {
      return { ok: false, error: `${i + 1}º lugar: use um número inteiro de 0 a ${MAX_PLACE_POINTS}.` };
    }
    table.push(n);
  }
  return { ok: true, table };
}

export function isTiebreak(v: unknown): v is Tiebreak {
  return v === "NICKNAME" || v === "WINS";
}

/** A table stored in the database (Json) → number[], or null when unusable. */
export function storedTable(v: unknown): number[] | null {
  const r = parsePointsTable(v);
  return r.ok ? r.table : null;
}

/** Points of a 0-based placement: table value × multiplier ("Pontuação dobrada" = 2). */
export function pointsForPlacement(table: readonly number[], index: number, multiplier = 1, eligible = true): number {
  if (!eligible) return 0;
  return (table[index] ?? 0) * multiplier;
}

// ── Ordering ──

export type MonthlyEntry = {
  id: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  tournamentPoints: number;
  adjustmentPoints: number;
  wins: number;
  losses: number;
};

/** Players with points only; points → (wins) → nickname A→Z → id. Fully deterministic. */
export function sortMonthly<T extends MonthlyEntry>(list: T[], tiebreak: Tiebreak): T[] {
  return list
    .filter((r) => r.points > 0)
    .sort((a, b) =>
      b.points - a.points ||
      (tiebreak === "WINS" ? b.wins - a.wins : 0) ||
      (a.name ?? "").localeCompare(b.name ?? "", "pt-BR") ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
}
