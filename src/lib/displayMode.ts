// How an event's matches are followed (Tournament.displayMode) — ONE place for
// the rule "which matches need a deck order" and for what is sent to the
// telões (docs/MODO-ARBITRAGEM.md). Pure module (no imports): unit-tested,
// usable on server and client.
//
//  ARENA       "Com telão Arena": the judge's panel drives the arena display
//              (players, sides, score, PRONTOS, countdown, videos). Formats
//              with a battle deck need each player's order before the battle.
//  JUDGE_ONLY  "Somente placar do juiz": scoring on a phone/tablet only.
//              Nothing goes to the telões and no deck order is required.
//
// Both modes use the same scoring, set, standings and ranking rules: the mode
// changes what is broadcast and whether an ORDER is required — never results.
// Registered decks and the event's deck format are never changed by it.

export const DISPLAY_MODES = ["ARENA", "JUDGE_ONLY"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export function parseDisplayMode(v: unknown): DisplayMode | null {
  return typeof v === "string" && (DISPLAY_MODES as readonly string[]).includes(v) ? (v as DisplayMode) : null;
}
/** Stored value → mode. Anything unknown (older rows) behaves as ARENA, the
 *  behavior every event had before the setting existed. */
export function effectiveDisplayMode(v: unknown): DisplayMode {
  return v === "JUDGE_ONLY" ? "JUDGE_ONLY" : "ARENA";
}

export const DISPLAY_MODE_QUESTION = "Como as partidas serão acompanhadas?";
export const DISPLAY_MODE_LABEL: Record<DisplayMode, string> = {
  ARENA: "Com telão Arena",
  JUDGE_ONLY: "Somente placar do juiz",
};
export const DISPLAY_MODE_DESCRIPTION: Record<DisplayMode, string> = {
  ARENA: "Exibe jogadores, pontos e animações nas telas das arenas. Nos formatos com deck ordenado, é necessário definir a ordem antes de iniciar.",
  JUDGE_ONLY: "Permite arbitrar pelo celular ou tablet, sem transmitir para as telas das arenas e sem exigir ordem de deck.",
};

/** Does this event send anything to the telões? */
export function broadcasts(mode: unknown): boolean {
  return effectiveDisplayMode(mode) === "ARENA";
}

// Same formats as deckFormat.usesBattleDeck (kept import-free on purpose).
const battleDeck = (deckType: string | null | undefined) => deckType === "THREE_ON_THREE" || deckType === "THREE_ON_THREE_PLUS_ONE";

/** Central rule: ARENA + a format whose battles rotate through an ordered
 *  deck → an order is required. JUDGE_ONLY never requires one; SOLO never
 *  has one. */
export function requiresDeckOrder(mode: unknown, deckType: string | null | undefined): boolean {
  return effectiveDisplayMode(mode) === "ARENA" && battleDeck(deckType);
}

/** 3on3 + 1 reserva: in ARENA both trios must be confirmed before the start
 *  (the order is built from them). In JUDGE_ONLY declaring the trio stays
 *  available — and is locked at the start when both declared it — but it
 *  never blocks the start. The reserve rules themselves are unchanged. */
export function requiresTrioToStart(mode: unknown, deckType: string | null | undefined): boolean {
  return effectiveDisplayMode(mode) === "ARENA" && deckType === "THREE_ON_THREE_PLUS_ONE";
}

/** Where a match stands, from its stored sets: the set the next battle
 *  belongs to, how many battles of it were already scored, and the deck cycle
 *  (3 battles per cycle) it falls in. */
export function battlePosition(sets: { setNumber: number; status: string; points: number }[]): { setNumber: number; battle: number; cycleIndex: number } {
  const current = sets.find((s) => s.status === "IN_PROGRESS");
  if (current) return { setNumber: current.setNumber, battle: current.points, cycleIndex: Math.floor(current.points / 3) };
  const finished = sets.filter((s) => s.status === "FINISHED").length;
  return { setNumber: finished + 1, battle: 0, cycleIndex: 0 };
}

/**
 * Players still missing the order for the battle at (setNumber, cycleIndex).
 * Only players with a complete deck (3+ registered Beyblades) can have an
 * order, so only they are asked for one — an incomplete registration is shown
 * as such, never blocked by an order that can't exist. A bye needs nothing.
 */
export function missingDeckOrders(input: {
  mode: unknown;
  deckType: string | null | undefined;
  bye: boolean;
  setNumber: number;
  cycleIndex: number;
  players: { userId: string; deckSize: number }[];
  orders: { userId: string; setNumber: number; cycleIndex: number }[];
}): string[] {
  if (input.bye || !requiresDeckOrder(input.mode, input.deckType)) return [];
  return input.players
    .filter((p) => p.deckSize >= 3)
    .filter((p) => !input.orders.some((o) => o.userId === p.userId && o.setNumber === input.setNumber && o.cycleIndex === input.cycleIndex))
    .map((p) => p.userId);
}

/** Message shown when an order is missing (names of who still has to send it). */
export function missingOrderMessage(names: string[]): string {
  if (names.length === 0) return "";
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  return `Ordem do deck pendente: ${who} ${names.length === 1 ? "precisa" : "precisam"} definir a ordem antes desta batalha.`;
}

/**
 * The mode can be chosen or corrected until matches effectively start (a
 * battle was started on a telão or a point was scored). After that it is
 * locked: switching would change what judges and telões expect mid-event.
 */
export function displayModeLock(t: { status: string; battlesStarted: boolean }): string | null {
  if (t.status === "FINISHED") return "O torneio já foi encerrado.";
  if (t.battlesStarted) return "As partidas já começaram (há batalhas iniciadas ou pontos registrados). Para não mudar o que juízes e telões esperam no meio do evento, o modo fica fixo a partir daí.";
  return null;
}
