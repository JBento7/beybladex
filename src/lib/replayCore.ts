// Local replay for the judge (docs/REPLAY-LOCAL.md): the pure rules — which
// recording format, quality presets, limits, storage advice, clip labels,
// cleanup selection and camera error messages. No imports, no browser APIs:
// unit-tested directly by Node (tests/replayCore.test.ts). The videos never
// leave the device; nothing here talks to the network.

/** Clip situation, as stored with the video on the device. */
export type ClipStatus = "RECORDING" | "AVAILABLE" | "KEPT" | "INTERRUPTED";

export const CLIP_STATUS_LABEL: Record<ClipStatus, string> = {
  RECORDING: "Gravando",
  AVAILABLE: "Disponível",
  KEPT: "Mantido para revisão",
  INTERRUPTED: "Interrompido",
};

/** Everything stored about a clip besides the video data. Never credentials. */
export type ClipMeta = {
  id: string;
  ownerId: string;
  tournamentId: string;
  matchId: string;
  setNumber: number;
  battle: number;
  /** 1 for the battle's first clip; a later start of the SAME battle (e.g. a
   *  recount after "Parar gravação") is take 2, 3… — never a silent duplicate. */
  take: number;
  createdAt: number;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  status: ClipStatus;
  /** Why the clip ended early, when it did. */
  endReason?: "limit" | "interrupted" | "camera" | "storage" | "left" | null;
  chunks: number;
};

// Order matters: MP4/H.264 first (Safari/iOS play it everywhere, and so does
// Chrome on recent versions), then WebM. "" lets the browser pick.
export const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

/** First format this browser can record, or "" (browser default). Never a
 *  fixed format that part of the devices can't produce. */
export function pickRecorderMime(isTypeSupported: ((t: string) => boolean) | null | undefined): string {
  if (typeof isTypeSupported !== "function") return "";
  for (const t of MIME_CANDIDATES) {
    try { if (isTypeSupported(t)) return t; } catch { /* some browsers throw */ }
  }
  return "";
}

/** Short file kind for display ("MP4", "WebM"). */
export function formatLabel(mime: string): string {
  if (/mp4/i.test(mime)) return "MP4";
  if (/webm/i.test(mime)) return "WebM";
  return mime ? mime.split(";")[0] : "—";
}

export type QualityKey = "low" | "medium" | "high";
export const QUALITY: Record<QualityKey, { label: string; width: number; height: number; fps: number; bitsPerSecond: number }> = {
  low: { label: "Econômica (480p)", width: 854, height: 480, fps: 30, bitsPerSecond: 1_200_000 },
  medium: { label: "Padrão (720p)", width: 1280, height: 720, fps: 30, bitsPerSecond: 2_500_000 },
  high: { label: "Alta (1080p)", width: 1920, height: 1080, fps: 30, bitsPerSecond: 5_000_000 },
};
export const DEFAULT_QUALITY: QualityKey = "medium";
export function parseQuality(v: unknown): QualityKey {
  return v === "low" || v === "medium" || v === "high" ? v : DEFAULT_QUALITY;
}

/** Safety limit per clip: a Beyblade battle takes seconds; this only stops a
 *  forgotten recording from filling the device. */
export const MAX_CLIP_MS = 3 * 60 * 1000;
/** Data is handed to storage in blocks of this length (never the whole clip in memory). */
export const CHUNK_MS = 1000;

/** Rough size of a full-length clip at a quality (for the space check). */
export function estimatedClipBytes(q: QualityKey, ms = MAX_CLIP_MS): number {
  return Math.ceil((QUALITY[q].bitsPerSecond / 8) * (ms / 1000));
}

/**
 * Storage advice before a recording, from navigator.storage.estimate():
 *  "unknown" — the browser doesn't tell; "full" — not even one full clip
 *  fits; "low" — fewer than 5 full clips fit; "ok" otherwise.
 */
export function storageAdvice(est: { usage?: number; quota?: number } | null | undefined, clipBytes: number): "ok" | "low" | "full" | "unknown" {
  if (!est || typeof est.quota !== "number" || typeof est.usage !== "number" || est.quota <= 0) return "unknown";
  const free = est.quota - est.usage;
  if (free < clipBytes) return "full";
  if (free < clipBytes * 5) return "low";
  return "ok";
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 KB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2).replace(".", ",")} GB`;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function clipLabel(c: Pick<ClipMeta, "setNumber" | "battle" | "take">): string {
  return `Set ${c.setNumber} · Batalha ${c.battle}${c.take > 1 ? ` (tomada ${c.take})` : ""}`;
}

/** Battle identity used to tie a clip to the battle being started. */
export const battleId = (setNumber: number, battle: number) => `${setNumber}:${battle}`;

/** Next take number for a battle, from the clips already stored for it. */
export function nextTake(clips: Pick<ClipMeta, "matchId" | "setNumber" | "battle" | "take">[], matchId: string, setNumber: number, battle: number): number {
  const same = clips.filter((c) => c.matchId === matchId && c.setNumber === setNumber && c.battle === battle);
  return same.length ? Math.max(...same.map((c) => c.take)) + 1 : 1;
}

/** Clips that belong to this account (never another account's on a shared device). */
export function ownClips<T extends Pick<ClipMeta, "ownerId">>(clips: T[], ownerId: string | null | undefined): T[] {
  if (!ownerId) return [];
  return clips.filter((c) => c.ownerId === ownerId);
}

/**
 * A clip left as RECORDING by a page that was closed: it can't be finished.
 * With data it becomes INTERRUPTED (what was stored may play, or may not);
 * without data it is removed.
 */
export function recoverAction(c: Pick<ClipMeta, "status" | "chunks">): "keep" | "interrupt" | "delete" {
  if (c.status !== "RECORDING") return "keep";
  return c.chunks > 0 ? "interrupt" : "delete";
}

/**
 * Pre-selection for "Limpar gravações antigas": clips older than `days`,
 * oldest first. Clips kept for review are never pre-selected (the judge has
 * to tick them explicitly) and are never removed silently.
 */
export function cleanupPreselect(clips: Pick<ClipMeta, "id" | "createdAt" | "status">[], now: number, days = 1): string[] {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return clips
    .filter((c) => c.status !== "KEPT" && c.status !== "RECORDING" && c.createdAt < cutoff)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((c) => c.id);
}

export const totalBytes = (clips: Pick<ClipMeta, "sizeBytes">[]) => clips.reduce((n, c) => n + (c.sizeBytes || 0), 0);

/** getUserMedia / MediaRecorder error → what the judge reads. Arbitration
 *  always continues (the camera is optional). */
export function cameraErrorMessage(e: unknown): string {
  const name = (e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "") || "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permissão da câmera negada. Libere a câmera nas configurações do navegador para este site, ou continue sem câmera.";
    case "NotFoundError":
    case "OverconstrainedError":
    case "DevicesNotFoundError":
      return "Nenhuma câmera disponível neste aparelho (ou a câmera escolhida não existe mais).";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "A câmera está ocupada por outro aplicativo ou não pôde ser aberta. Feche o outro aplicativo e tente de novo.";
    case "NotSupportedError":
    case "UNSUPPORTED":
      return "Este navegador não permite gravar vídeo da câmera. A arbitragem continua normalmente, sem replay.";
    case "QuotaExceededError":
      return "Sem espaço no armazenamento deste navegador para gravar. Apague gravações antigas ou continue sem câmera.";
    default:
      return "Não foi possível iniciar a câmera. Tente de novo ou continue sem câmera.";
  }
}

/** Seek steps offered in the player — seconds, never "frames": the device
 *  doesn't guarantee frame-accurate seeking. */
export const SEEK_STEPS = [-1, -0.2, 0.2, 1] as const;
export const SPEEDS = [1, 0.5, 0.25] as const;
export const speedLabel = (s: number) => `${String(s).replace(".", ",")}×`;
