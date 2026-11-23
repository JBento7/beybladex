"use client";

// Limited event history for the "Diagnóstico de tela" (docs/MODO-CAMERA.md):
// placar open/close, mount/unmount, resize/orientation, full screen, camera and
// recording, layout changes and JavaScript errors. Short technical messages
// only — never video, credentials, tokens, query strings or e-mails.

type Entry = { t: number; kind: string; msg: string };
const MAX = 80;
let entries: Entry[] = [];
const subs = new Set<() => void>();
let installed = false;

export function sanitizeDiag(msg: string): string {
  return String(msg)
    .replace(/https?:\/\/[^\s)'"]+/g, (u) => u.split("?")[0].split("#")[0])
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replace(/\b(token|senha|password|secret|authorization)=?[^\s&]*/gi, "$1=[oculto]")
    .slice(0, 160);
}

export function diag(kind: string, msg: string) {
  const last = entries[entries.length - 1];
  const clean = sanitizeDiag(msg);
  if (last && last.kind === kind && last.msg === clean && Date.now() - last.t < 300) return; // burst of identical events
  entries = [...entries, { t: Date.now(), kind, msg: clean }].slice(-MAX);
  subs.forEach((f) => f());
}
export const diagEntries = () => entries;
export function subscribeDiag(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
export function diagText(): string {
  return entries.map((e) => `${new Date(e.t).toISOString().slice(11, 23)} ${e.kind}: ${e.msg}`).join("\n");
}

/** JavaScript errors go to the history (once per page). */
export function installDiagErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => diag("erro JS", `${e.message || "erro"} @ ${(e.filename || "").split("/").pop()}:${e.lineno ?? ""}`));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { name?: string; message?: string } | undefined;
    diag("promessa rejeitada", `${r?.name ?? ""} ${r?.message ?? String(e.reason ?? "")}`);
  });
}
