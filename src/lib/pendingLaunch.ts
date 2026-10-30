// The judge's launch that is waiting for the server's confirmation, kept on
// the device (localStorage) BEFORE it is sent, so a lost response, a reload
// or a closed tab never loses it silently (docs/JUIZ-TELAO.md). One per match:
// a new launch is only accepted after this one is resolved.
// Only these fields are stored — never tokens, cookies or credentials.
// No imports: unit-tested directly by Node (tests/pendingLaunch.test.ts).

export type PendingLaunch = {
  actionId: string;
  matchId: string;
  scorerId: string;
  scorerName: string;
  finishType: string;
  points: number;
  beybladeId: string | null;
  /** Context the judge saw: the server refuses the launch elsewhere. */
  setNumber: number;
  battle: number;
  createdAt: number;
};

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export const pendingKey = (matchId: string) => `lbl:juiz:pendente:${matchId}`;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function savePending(store: Store | null | undefined, p: PendingLaunch): boolean {
  if (!store) return false;
  const clean: PendingLaunch = {
    actionId: String(p.actionId), matchId: String(p.matchId), scorerId: String(p.scorerId), scorerName: String(p.scorerName),
    finishType: String(p.finishType), points: Number(p.points), beybladeId: p.beybladeId ? String(p.beybladeId) : null,
    setNumber: Number(p.setNumber), battle: Number(p.battle), createdAt: Number(p.createdAt),
  };
  try { store.setItem(pendingKey(p.matchId), JSON.stringify(clean)); return true; } catch { return false; }
}

export function loadPending(store: Store | null | undefined, matchId: string, now = Date.now()): PendingLaunch | null {
  if (!store) return null;
  try {
    const raw = store.getItem(pendingKey(matchId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PendingLaunch>;
    const ok = typeof p.actionId === "string" && p.matchId === matchId && typeof p.scorerId === "string" && typeof p.finishType === "string"
      && Number.isInteger(p.setNumber) && Number.isInteger(p.battle) && typeof p.createdAt === "number";
    if (!ok) { store.removeItem(pendingKey(matchId)); return null; }
    // Too old to be resolved meaningfully: drop it (the server state is the truth).
    if (now - (p.createdAt as number) > MAX_AGE_MS) { store.removeItem(pendingKey(matchId)); return null; }
    return p as PendingLaunch;
  } catch {
    return null;
  }
}

export function clearPending(store: Store | null | undefined, matchId: string, actionId?: string) {
  if (!store) return;
  try {
    if (actionId) {
      const cur = store.getItem(pendingKey(matchId));
      if (cur && !cur.includes(actionId)) return; // a different (newer) pending: keep it
    }
    store.removeItem(pendingKey(matchId));
  } catch { /* ignore */ }
}
