// Deck formats (Tournament.deckType) — ONE place for sizes, labels and the
// deck rules shared by registration, the per-match trio and the scoreboard.
// Pure module (no imports): unit-tested, usable on server and client.
//
//  SOLO                      1 Beyblade.
//  THREE_ON_THREE            3 Beyblades, the same 3 in every match.
//  THREE_ON_THREE_PLUS_ONE   4 registered; before each match the player picks
//                            3 active ones (the 4th is that match's reserve).
//                            The trio is locked when the match starts.
//
// Repeated parts (official events only — casual events keep their policy):
//  - SOLO / 3on3: no part may repeat across the whole deck (unchanged).
//  - 3on3 + 1 reserva: the rule applies to the ACTIVE trio of each match. The
//    reserve may share parts with the trio; every trio actually chosen must be
//    valid, and the 4 registered must allow at least one valid trio.

export const DECK_TYPES = ["SOLO", "THREE_ON_THREE", "THREE_ON_THREE_PLUS_ONE"] as const;
export type DeckTypeValue = (typeof DECK_TYPES)[number];

export function parseDeckType(v: unknown): DeckTypeValue | null {
  return typeof v === "string" && (DECK_TYPES as readonly string[]).includes(v) ? (v as DeckTypeValue) : null;
}

/** Beyblades registered per participant. */
export function registeredDeckSize(t: string | null | undefined): number {
  return t === "THREE_ON_THREE_PLUS_ONE" ? 4 : t === "THREE_ON_THREE" ? 3 : 1;
}
/** Battles rotate through a 3-Beyblade order (deck orders per set/cycle). */
export function usesBattleDeck(t: string | null | undefined): boolean {
  return t === "THREE_ON_THREE" || t === "THREE_ON_THREE_PLUS_ONE";
}
/** A trio must be chosen (and locked) per match. */
export function hasMatchTrio(t: string | null | undefined): boolean {
  return t === "THREE_ON_THREE_PLUS_ONE";
}

export const DECK_LABEL_SHORT: Record<DeckTypeValue, string> = {
  SOLO: "Solo",
  THREE_ON_THREE: "3on3",
  THREE_ON_THREE_PLUS_ONE: "3on3 + 1 reserva",
};
export const DECK_LABEL_FULL: Record<DeckTypeValue, string> = {
  SOLO: "Solo",
  THREE_ON_THREE: "3 on 3",
  THREE_ON_THREE_PLUS_ONE: "3 on 3 + 1 reserva",
};
export const DECK_DESCRIPTION: Record<DeckTypeValue, string> = {
  SOLO: "Cada participante usa 1 Beyblade.",
  THREE_ON_THREE: "Cada participante inscreve 3 Beyblades e usa as 3 em todos os confrontos.",
  THREE_ON_THREE_PLUS_ONE: "Cadastre 4 Beyblades e escolha 3 para cada confronto. A reserva pode entrar entre confrontos.",
};
/** Shown to the organizer when the format is picked. */
export const PLUS_ONE_ORGANIZER_NOTE =
  "Cada participante inscreve 4 Beyblades e utiliza 3 por confronto. A troca da reserva é permitida antes do início de cada confronto.";
/** Shown wherever the repeated-parts rule matters (organizer and players). */
export const PLUS_ONE_PARTS_RULE =
  "Em torneios oficiais, as 3 Beyblades ativas de cada confronto não podem repetir peças entre si. A reserva pode compartilhar peças com o trio, desde que cada trio escolhido seja válido.";

export function deckLabel(t: string | null | undefined, full = false): string {
  const v = parseDeckType(t) ?? "SOLO";
  return full ? DECK_LABEL_FULL[v] : DECK_LABEL_SHORT[v];
}

export function registrationCountMessage(t: string | null | undefined): string {
  if (t === "THREE_ON_THREE_PLUS_ONE") return "Selecione exatamente 4 Beyblades — 3 serão usadas por confronto e 1 ficará como reserva.";
  if (t === "THREE_ON_THREE") return "Selecione exatamente 3 combos do seu repertório para o formato 3 contra 3.";
  return "Selecione 1 combo do seu repertório para o formato solo.";
}

// ── Parts ──────────────────────────────────────────────────────────────────
export type DeckBey = {
  id: string;
  name?: string | null;
  beyLine?: string | null;
  blade?: string | null;
  ratchet?: string | null;
  bit?: string | null;
  lockChip?: string | null;
  metalBlade?: string | null;
  assistBlade?: string | null;
  overBlade?: string | null;
};

// Same fields and normalization the platform already used for official decks
// (join/finals-deck): trim + lowercase, compared per part slot.
const PART_FIELDS: [keyof DeckBey, string][] = [
  ["blade", "Blade"],
  ["ratchet", "Ratchet"],
  ["bit", "Bit"],
  ["lockChip", "Lock Chip"],
  ["metalBlade", "Metal Blade"],
];
const norm = (v: string) => v.trim().toLowerCase();

/** Repeated parts across `beys` (labels like `Bit "Rush"`); [] when none. */
export function findDuplicateParts(beys: DeckBey[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const bey of beys) {
    for (const [field, label] of PART_FIELDS) {
      const val = bey[field];
      if (!val || typeof val !== "string" || !val.trim()) continue;
      const key = `${String(field)}:${norm(val)}`;
      if (seen.has(key)) dupes.add(`${label} "${val.trim()}"`);
      else seen.add(key);
    }
  }
  return [...dupes];
}

/** Every 3-of-4 combination, as [active ids, reserve id]. */
export function trioCombinations(ids: string[]): { active: [string, string, string]; reserve: string }[] {
  if (ids.length !== 4) return [];
  return ids.map((reserve) => ({ active: ids.filter((x) => x !== reserve) as [string, string, string], reserve }));
}

/** Trios (of the 4 registered) allowed by the parts rule. */
export function validTrios(beys: DeckBey[], official: boolean): { active: [string, string, string]; reserve: string }[] {
  const byId = new Map(beys.map((b) => [b.id, b]));
  return trioCombinations(beys.map((b) => b.id)).filter((c) => !official || findDuplicateParts(c.active.map((id) => byId.get(id)!)).length === 0);
}

export type DeckCheck = { ok: true } | { ok: false; error: string; duplicateParts?: string[] };

/** Registration check for an already-owned, distinct set of Beyblades. */
export function checkRegisteredDeck(t: string | null | undefined, beys: DeckBey[], official: boolean): DeckCheck {
  const n = registeredDeckSize(t);
  if (beys.length !== n) return { ok: false, error: registrationCountMessage(t) };
  if (new Set(beys.map((b) => b.id)).size !== beys.length) return { ok: false, error: "Não é possível selecionar o mesmo combo mais de uma vez." };
  if (!official || n === 1) return { ok: true };
  if (t === "THREE_ON_THREE_PLUS_ONE") {
    if (validTrios(beys, true).length === 0) {
      return { ok: false, error: "Nenhuma combinação de 3 entre as 4 Beyblades é válida: em torneios oficiais o trio ativo não pode repetir peças. Troque pelo menos uma Beyblade." };
    }
    return { ok: true };
  }
  const dupes = findDuplicateParts(beys);
  if (dupes.length) return { ok: false, error: `Em torneios oficiais as beyblades não podem ter peças repetidas. Peça(s) duplicada(s): ${dupes.join(", ")}.`, duplicateParts: dupes };
  return { ok: true };
}

/** A trio chosen for one match. `registered` = the 4 ids of the registration. */
export function checkTrio(
  registered: DeckBey[],
  selected: unknown,
  official: boolean
): { ok: true; active: [string, string, string]; reserve: string } | { ok: false; error: string } {
  if (registered.length !== 4) return { ok: false, error: "A inscrição não tem as 4 Beyblades exigidas por este formato." };
  if (!Array.isArray(selected) || selected.some((x) => typeof x !== "string")) return { ok: false, error: "Selecione 3 Beyblades." };
  const ids = selected as string[];
  if (ids.length !== 3) return { ok: false, error: "Escolha exatamente 3 Beyblades ativas para esta partida." };
  if (new Set(ids).size !== 3) return { ok: false, error: "Não é possível repetir a mesma Beyblade no trio." };
  const regIds = registered.map((b) => b.id);
  if (ids.some((id) => !regIds.includes(id))) return { ok: false, error: "Só é possível usar as 4 Beyblades inscritas neste torneio." };
  const byId = new Map(registered.map((b) => [b.id, b]));
  if (official) {
    const dupes = findDuplicateParts(ids.map((id) => byId.get(id)!));
    if (dupes.length) return { ok: false, error: `Este trio repete peças (${dupes.join(", ")}). Em torneios oficiais as 3 ativas não podem repetir peças.` };
  }
  const reserve = regIds.find((id) => !ids.includes(id))!;
  return { ok: true, active: ids as [string, string, string], reserve };
}

/** A deck order (3 ids) must be exactly the locked/confirmed trio. */
export function orderMatchesTrio(order: string[], trio: string[]): boolean {
  return order.length === 3 && new Set(order).size === 3 && order.every((id) => trio.includes(id)) && trio.length === 3;
}

/** Snapshot entry for a registered Beyblade (as registered). */
export function snapshotOf(b: DeckBey): Required<DeckBey> {
  return {
    id: b.id, name: b.name ?? "", beyLine: b.beyLine ?? null, blade: b.blade ?? null, ratchet: b.ratchet ?? null, bit: b.bit ?? null,
    lockChip: b.lockChip ?? null, metalBlade: b.metalBlade ?? null, assistBlade: b.assistBlade ?? null, overBlade: b.overBlade ?? null,
  } as Required<DeckBey>;
}

/** Whether a live Beyblade differs from its registration snapshot. */
export function changedSinceRegistration(snap: DeckBey, live: DeckBey | null | undefined): boolean {
  if (!live) return true;
  const keys: (keyof DeckBey)[] = ["name", "blade", "ratchet", "bit", "lockChip", "metalBlade", "assistBlade", "overBlade"];
  return keys.some((k) => (snap[k] ?? null) !== (live[k] ?? null));
}

/** Registered ids from the 4 participant columns, in order, without blanks. */
export function registeredIds(p: { beyblade1?: string | null; beyblade2?: string | null; beyblade3?: string | null; beyblade4?: string | null }): string[] {
  return [p.beyblade1, p.beyblade2, p.beyblade3, p.beyblade4].filter((x): x is string => !!x);
}

/** Is a registration complete for the event's deck format? */
export function registrationComplete(t: string | null | undefined, p: { beyblade1?: string | null; beyblade2?: string | null; beyblade3?: string | null; beyblade4?: string | null }): boolean {
  return registeredIds(p).length === registeredDeckSize(t);
}
