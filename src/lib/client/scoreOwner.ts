"use client";

// One open scoreboard per match. The tournament page can render the same
// match card more than once (mobile grid + arena grid, shown/hidden by CSS
// breakpoints); only ONE ScoreModal instance may own the open scoreboard, so
// a rotation that swaps which grid is visible never shows/hides a different
// copy, and two copies never run cameras/polls at the same time.
import { useSyncExternalStore } from "react";

const owners = new Map<string, string>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const scoreOwner = (matchId: string) => owners.get(matchId) ?? null;
export function claimScore(matchId: string, instance: string) { if (owners.get(matchId) !== instance) { owners.set(matchId, instance); emit(); } }
export function releaseScore(matchId: string, instance: string) { if (owners.get(matchId) === instance) { owners.delete(matchId); emit(); } }
export function useScoreOwner(matchId: string): string | null {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    () => owners.get(matchId) ?? null,
    () => null,
  );
}
