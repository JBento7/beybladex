"use client";

// Header profile (avatar + display name) cached per user for the whole visit,
// so moving between pages doesn't refetch it. Refreshed when the profile
// screen announces a change ("lbl:profile-updated"), and cleared on logout
// (sessionStorage.clear in lib/client/logout).
export type HeaderProfile = { avatarUrl: string | null; name: string | null };
const KEY = (uid: string) => `lbl:me:${uid}`;
const MAX_AGE_MS = 10 * 60_000;
let memory: { uid: string; at: number; p: HeaderProfile } | null = null;
let inflight: Promise<HeaderProfile | null> | null = null;

export function cachedProfile(uid: string): HeaderProfile | null {
  if (memory?.uid === uid && Date.now() - memory.at < MAX_AGE_MS) return memory.p;
  try {
    const raw = sessionStorage.getItem(KEY(uid));
    if (raw) {
      const v = JSON.parse(raw) as { at: number; p: HeaderProfile };
      if (Date.now() - v.at < MAX_AGE_MS) { memory = { uid, ...v }; return v.p; }
    }
  } catch { /* storage unavailable */ }
  return null;
}

export function loadProfile(uid: string, force = false): Promise<HeaderProfile | null> {
  if (!force) {
    const hit = cachedProfile(uid);
    if (hit) return Promise.resolve(hit);
    if (inflight) return inflight;
  }
  inflight = fetch("/api/profile/me", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: HeaderProfile | null) => {
      if (!d) return null;
      const p = { avatarUrl: d.avatarUrl ?? null, name: d.name ?? null };
      memory = { uid, at: Date.now(), p };
      try { sessionStorage.setItem(KEY(uid), JSON.stringify({ at: memory.at, p })); } catch { /* ignore */ }
      return p;
    })
    .catch(() => null)
    .finally(() => { inflight = null; });
  return inflight;
}

/** Call after saving the name or the photo: every header updates. */
export function announceProfileUpdated() {
  memory = null;
  try { Object.keys(sessionStorage).filter((k) => k.startsWith("lbl:me:")).forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
  window.dispatchEvent(new Event("lbl:profile-updated"));
}
