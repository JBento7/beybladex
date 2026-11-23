"use client";

// ONE full-screen controller for the whole app (docs/MODO-CAMERA.md §0):
// the judge kiosk, the scoreboard and its "Tela cheia" button all go through
// here. Always the persistent <html> element (it contains the scoreboard
// portal, so dialogs stay inside the full-screen tree). One request at a
// time; never called from resize/orientation events; only the orientation
// lock taken HERE is released here.

import { describeError } from "@/lib/screenLayout";
import { diag } from "./diagLog";

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type Orient = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };
export type FsSource = "kiosk" | "placar" | "usuario";

let pending: Promise<void> | null = null;
let enteredBy: FsSource | null = null;
let lockOwned = false;
let placarSession = false;
let listening = false;
let lastError: string | null = null;

export const fsElement = () => { const d = document as FsDoc; return d.fullscreenElement ?? d.webkitFullscreenElement ?? null; };
export const isFs = () => !!fsElement();
export const fsLastError = () => lastError;
const setErr = (e: string) => { lastError = e; diag("tela cheia", e); };

function listen() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  const on = () => {
    const el = fsElement();
    diag("tela cheia", el ? `entrou (${el.tagName.toLowerCase()})` : "saiu");
    if (!el) { enteredBy = null; lockOwned = false; }
  };
  document.addEventListener("fullscreenchange", on);
  document.addEventListener("webkitfullscreenchange", on);
}

/** While the scoreboard is open it controls full screen: the kiosk doesn't re-enter on every tap. */
export function setPlacarSession(on: boolean) { placarSession = on; listen(); }
export const placarControlsFullscreen = () => placarSession;

/** Must be called directly from a tap. Returns once the request settled (result via fullscreenchange). */
export function requestFullscreen(source: FsSource): Promise<void> {
  listen();
  if (pending) return pending;
  if (isFs()) return Promise.resolve();
  const el = document.documentElement as FsEl;
  const p = (async () => {
    try {
      if (typeof el.requestFullscreen === "function") await el.requestFullscreen();
      else if (typeof el.webkitRequestFullscreen === "function") await el.webkitRequestFullscreen();
      else { setErr("requestFullscreen indisponível neste navegador"); return; }
      enteredBy = source;
    } catch (e) {
      setErr(`tela cheia recusada (${source}) — ${describeError(e)}`);
    }
  })();
  pending = p;
  void p.finally(() => { if (pending === p) pending = null; });
  return p;
}

/** Orientation lock (only if the API exists), after full screen. Never from resize events. */
export async function lockLandscape(): Promise<{ ok: boolean; error?: string }> {
  const o = (typeof screen !== "undefined" ? screen.orientation : undefined) as Orient | undefined;
  if (typeof o?.lock !== "function") { setErr("screen.orientation.lock indisponível"); return { ok: false, error: "indisponível" }; }
  try { await o.lock("landscape"); lockOwned = true; diag("orientação", "bloqueio em paisagem aceito"); return { ok: true }; }
  catch (e) { const d = describeError(e); setErr(`bloqueio de orientação recusado — ${d}`); return { ok: false, error: d }; }
}

/** Leaves full screen only when `source` (or the user) owns it; releases only our own lock. */
export async function exitFullscreen(source: FsSource): Promise<void> {
  const o = (typeof screen !== "undefined" ? screen.orientation : undefined) as Orient | undefined;
  if (lockOwned) { try { o?.unlock?.(); } catch { /* nothing to release */ } lockOwned = false; }
  if (!isFs() || (source !== "usuario" && enteredBy !== source)) return;
  const d = document as FsDoc;
  try {
    if (d.fullscreenElement) await d.exitFullscreen();
    else if (d.webkitFullscreenElement) await d.webkitExitFullscreen?.();
  } catch (e) { setErr(`sair da tela cheia falhou — ${describeError(e)}`); }
}
