"use client";

// Local replay storage (docs/REPLAY-LOCAL.md): IndexedDB on THIS device only.
// Each clip is tied to the account that recorded it, the match and this
// device (a random local id); another user opening the same scoreboard on
// another device never receives these videos.
// Videos are never sent anywhere and never go to localStorage. A clip is
// stored as its metadata (lib/replayCore.ClipMeta — no credentials, no
// tokens) plus its video in blocks of ~1 s, written as they are recorded,
// so a long clip is never held whole in memory and a page that dies keeps
// what was already written.

import { visibleTo, type ClipMeta } from "@/lib/replayCore";

const DB_NAME = "lbl-replays";
const DB_VERSION = 1;
const CLIPS = "clips";
const CHUNKS = "chunks";

export class StorageFullError extends Error {
  name = "QuotaExceededError";
}

let dbPromise: Promise<IDBDatabase> | null = null;

// Random id of this browser on this device — identification only, never a credential.
const DEVICE_KEY = "lbl:replay:dispositivo";
let deviceIdMem: string | null = null;
export function localDeviceId(): string {
  if (deviceIdMem) return deviceIdMem;
  const fresh = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    deviceIdMem = localStorage.getItem(DEVICE_KEY) || fresh();
    localStorage.setItem(DEVICE_KEY, deviceIdMem);
  } catch { deviceIdMem = deviceIdMem ?? fresh(); }
  return deviceIdMem;
}

export function replayStorageSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!replayStorageSupported()) { reject(new Error("IndexedDB indisponível")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CLIPS)) {
        const s = db.createObjectStore(CLIPS, { keyPath: "id" });
        s.createIndex("owner", "ownerId");
        s.createIndex("owner_match", ["ownerId", "matchId"]);
      }
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS, { keyPath: ["clipId", "seq"] });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error("Armazenamento local bloqueado por outra aba.")); };
  });
  return dbPromise;
}

const isQuota = (e: unknown) => !!e && typeof e === "object" && "name" in e && /Quota/i.test(String((e as { name: unknown }).name));

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(isQuota(tx.error) ? new StorageFullError("Sem espaço") : tx.error ?? new Error("Transação cancelada"));
    tx.onerror = () => { /* onabort follows */ };
  });
}
function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
const chunkRange = (clipId: string) => IDBKeyRange.bound([clipId, 0], [clipId, Number.MAX_SAFE_INTEGER]);

export async function putClip(meta: ClipMeta): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CLIPS, "readwrite");
  tx.objectStore(CLIPS).put(meta);
  await txDone(tx);
}

export async function getClip(id: string): Promise<ClipMeta | null> {
  const db = await openDb();
  return ((await reqP(db.transaction(CLIPS).objectStore(CLIPS).get(id))) as ClipMeta | undefined) ?? null;
}

export async function updateClip(id: string, patch: Partial<ClipMeta>): Promise<ClipMeta | null> {
  const db = await openDb();
  const tx = db.transaction(CLIPS, "readwrite");
  const store = tx.objectStore(CLIPS);
  const cur = (await reqP(store.get(id))) as ClipMeta | undefined;
  let next: ClipMeta | null = null;
  if (cur) { next = { ...cur, ...patch, id: cur.id, ownerId: cur.ownerId }; store.put(next); }
  await txDone(tx);
  return next;
}

/** Appends one block of video and updates the clip's size/count in the SAME transaction. */
export async function addChunk(clipId: string, seq: number, data: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([CHUNKS, CLIPS], "readwrite");
  tx.objectStore(CHUNKS).put({ clipId, seq, data });
  const clips = tx.objectStore(CLIPS);
  const cur = (await reqP(clips.get(clipId))) as ClipMeta | undefined;
  if (cur) clips.put({ ...cur, sizeBytes: (cur.sizeBytes || 0) + data.size, chunks: Math.max(cur.chunks || 0, seq + 1) });
  await txDone(tx);
}

/** The whole clip as one Blob (only when the user opens the replay). */
export async function getClipBlob(meta: ClipMeta): Promise<Blob> {
  const db = await openDb();
  const rows = (await reqP(db.transaction(CHUNKS).objectStore(CHUNKS).getAll(chunkRange(meta.id)))) as { seq: number; data: Blob }[];
  rows.sort((a, b) => a.seq - b.seq);
  return new Blob(rows.map((r) => r.data), { type: meta.mimeType || rows[0]?.data.type || "video/webm" });
}

/** Clips of this account on this device (optionally of one match), newest first. */
export async function listClips(ownerId: string, matchId?: string): Promise<ClipMeta[]> {
  if (!ownerId) return [];
  const db = await openDb();
  const store = db.transaction(CLIPS).objectStore(CLIPS);
  const rows = (matchId
    ? await reqP(store.index("owner_match").getAll([ownerId, matchId]))
    : await reqP(store.index("owner").getAll(ownerId))) as ClipMeta[];
  const device = localDeviceId();
  return rows.filter((c) => visibleTo(c, ownerId, device)).sort((a, b) => b.createdAt - a.createdAt);
}

/** Deletes clips and their video blocks for good. */
export async function deleteClips(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  const tx = db.transaction([CLIPS, CHUNKS], "readwrite");
  for (const id of ids) {
    tx.objectStore(CLIPS).delete(id);
    tx.objectStore(CHUNKS).delete(chunkRange(id));
  }
  await txDone(tx);
}

export async function storageEstimate(): Promise<{ usage?: number; quota?: number } | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage, quota: e.quota };
  } catch { return null; }
}

/** Asks the browser to keep this site's data under storage pressure (best effort, no prompt on most browsers). */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
