// Server side of deck registration: loads the chosen Beyblades, checks them
// against the event's deck format (lib/deckFormat) and returns the columns to
// write — the ids AND a snapshot of each Beyblade as registered, so a later
// profile edit never changes the deck accepted for the event.
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { checkRegisteredDeck, registeredDeckSize, snapshotOf, type DeckBey } from "./deckFormat";

export const DECK_BEY_SELECT = {
  id: true, userId: true, name: true, beyLine: true, blade: true, ratchet: true, bit: true,
  lockChip: true, metalBlade: true, assistBlade: true, overBlade: true,
} as const;

export type DeckColumns = {
  beyblade1: string | null; beyblade2: string | null; beyblade3: string | null; beyblade4: string | null;
  deckSnapshot: Prisma.InputJsonValue; deckSnapshotAt: Date | null;
};

export function deckColumns(beys: DeckBey[]): DeckColumns {
  return {
    beyblade1: beys[0]?.id ?? null, beyblade2: beys[1]?.id ?? null, beyblade3: beys[2]?.id ?? null, beyblade4: beys[3]?.id ?? null,
    deckSnapshot: beys.map(snapshotOf) as unknown as Prisma.InputJsonValue,
    deckSnapshotAt: new Date(),
  };
}

/**
 * Validates `ids` (order kept) for `ownerId` and the event's format.
 * `allowEmpty` lets the organization add a player without a deck yet (the
 * registration then stays incomplete and can't be approved/inspected).
 */
export async function prepareDeck(opts: {
  deckType: string; official: boolean; ownerId: string; ids: unknown; allowEmpty?: boolean;
}): Promise<{ ok: true; columns: DeckColumns | null; beys: DeckBey[] } | { ok: false; status: number; error: string; duplicateParts?: string[] }> {
  const raw = Array.isArray(opts.ids) ? opts.ids : [];
  const ids = raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (ids.length !== raw.length) return { ok: false, status: 400, error: "Lista de Beyblades inválida." };
  if (ids.length === 0 && opts.allowEmpty) return { ok: true, columns: null, beys: [] };
  if (new Set(ids).size !== ids.length) return { ok: false, status: 400, error: "Não é possível selecionar o mesmo combo mais de uma vez." };
  if (ids.length !== registeredDeckSize(opts.deckType)) {
    const c = checkRegisteredDeck(opts.deckType, ids.map((id) => ({ id })), opts.official);
    return { ok: false, status: 400, error: c.ok ? "Quantidade de Beyblades inválida." : c.error };
  }
  const owned = await prisma.beyblade.findMany({ where: { id: { in: ids }, userId: opts.ownerId }, select: DECK_BEY_SELECT });
  if (owned.length !== ids.length) return { ok: false, status: 400, error: "Você só pode selecionar combos cadastrados na sua conta." };
  const ordered = ids.map((id) => owned.find((b) => b.id === id)!) as DeckBey[];
  const check = checkRegisteredDeck(opts.deckType, ordered, opts.official);
  if (!check.ok) return { ok: false, status: 400, error: check.error, duplicateParts: check.duplicateParts };
  return { ok: true, columns: deckColumns(ordered), beys: ordered };
}

/** Registered deck of a participant: the snapshot when present (as
 *  registered), otherwise the live Beyblades (registrations made before
 *  snapshots existed). */
export async function registeredDeck(p: { beyblade1: string | null; beyblade2: string | null; beyblade3: string | null; beyblade4?: string | null; deckSnapshot?: unknown }): Promise<DeckBey[]> {
  const ids = [p.beyblade1, p.beyblade2, p.beyblade3, p.beyblade4 ?? null].filter((x): x is string => !!x);
  const snap = Array.isArray(p.deckSnapshot) ? (p.deckSnapshot as DeckBey[]) : null;
  if (snap && ids.every((id) => snap.some((s) => s.id === id))) return ids.map((id) => snap.find((s) => s.id === id)!);
  const live = await prisma.beyblade.findMany({ where: { id: { in: ids } }, select: DECK_BEY_SELECT });
  return ids.map((id) => live.find((b) => b.id === id)).filter(Boolean) as DeckBey[];
}
