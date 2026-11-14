// Reduel — "repetir lançamento" (docs/REDUEL.md): the pure rules. No imports:
// unit-tested directly by Node (tests/reduelRules.test.ts).
//
// A Reduel annuls the CURRENT attempt of a battle that has no confirmed point
// yet. It never changes points, sets, sides, deck order, cycle or reserves:
// the same battle is launched again with the same Beyblades.
//
// Battle identity is the same as a point's context: the set and how many
// battles of it were already scored (0-based). `attempt` counts the attempts
// of that battle: 1 for the first launch, +1 after each Reduel.

export type ReduelRequest = { setNumber: number; battle: number; attempt?: number | null };
export type ReduelPosition = { setNumber: number; battle: number };

export type ReduelDecision =
  | { ok: true; annulledAttempt: number }
  | { ok: false; status: number; code: "MATCH_FINISHED" | "BYE" | "BATTLE_SCORED" | "CONTEXT_CHANGED" | "REDUEL_STALE" | "INVALID"; error: string };

export const REDUEL_CONFIRM_TEXT = "Repetir este lançamento? Os pontos e sets anteriores serão mantidos.";
export const VOIDED_LABEL = "Tentativa anulada — Reduel";

export function parseReduelRequest(b: unknown): (ReduelRequest & { opId: string }) | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const opId = typeof o.opId === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(o.opId) ? o.opId : null;
  if (!opId || !Number.isInteger(o.setNumber) || !Number.isInteger(o.battle)) return null;
  if ((o.setNumber as number) < 1 || (o.battle as number) < 0) return null;
  const attempt = Number.isInteger(o.attempt) ? (o.attempt as number) : null;
  return { opId, setNumber: o.setNumber as number, battle: o.battle as number, attempt };
}

/**
 * Can this Reduel be registered now?
 *  - finished match / bye → no (corrections of a finished match go through the organization);
 *  - the battle the operator saw already has a point (the position moved on)
 *    → BATTLE_SCORED: correct the last launch with the authorized flow (undo);
 *  - another set/battle → CONTEXT_CHANGED;
 *  - a Reduel already registered for this attempt by someone else → REDUEL_STALE.
 * `reduelsSoFar` = Reduels already stored for (set, battle).
 */
export function decideReduel(input: {
  status: string;
  bye: boolean;
  position: ReduelPosition;
  request: ReduelRequest;
  reduelsSoFar: number;
}): ReduelDecision {
  const { status, bye, position: pos, request: req } = input;
  if (bye) return { ok: false, status: 400, code: "BYE", error: "Bye não tem lançamentos." };
  if (status === "FINISHED") return { ok: false, status: 409, code: "MATCH_FINISHED", error: "Partida finalizada: correções só pela organização." };
  const later = pos.setNumber > req.setNumber || (pos.setNumber === req.setNumber && pos.battle > req.battle);
  if (later) {
    return {
      ok: false, status: 409, code: "BATTLE_SCORED",
      error: "Este lançamento já tem ponto confirmado. Para repetir, corrija primeiro o último lançamento pelo fluxo autorizado (“Desfazer último lançamento”). Nenhum ponto foi removido.",
    };
  }
  if (pos.setNumber !== req.setNumber || pos.battle !== req.battle) {
    return { ok: false, status: 409, code: "CONTEXT_CHANGED", error: `O placar mudou (agora: set ${pos.setNumber}, batalha ${pos.battle + 1}). Confira antes de repetir.` };
  }
  if (req.attempt != null && req.attempt !== input.reduelsSoFar) {
    return { ok: false, status: 409, code: "REDUEL_STALE", error: "Já foi registrado um Reduel para esta tentativa. Confira o placar." };
  }
  return { ok: true, annulledAttempt: input.reduelsSoFar + 1 };
}

/**
 * A point carries the attempt the operator saw (Reduels counted for that
 * battle). If a Reduel was registered since, the point belongs to an annulled
 * attempt and is refused — never credited to the new launch.
 */
export function pointAttemptOk(sentAttempt: number | null | undefined, reduelsNow: number): boolean {
  return sentAttempt == null || sentAttempt === reduelsNow;
}

/** Start key of a battle attempt: a Reduel makes the same battle a new start. */
export const attemptKey = (setNumber: number, battle: number, reduels: number) => `${setNumber}:${battle}:${reduels}`;
