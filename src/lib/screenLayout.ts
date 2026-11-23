// Placar: which layout to show and the "Diagnóstico de tela" text
// (docs/MODO-CAMERA.md §6). Pure, no imports: unit-tested by Node
// (tests/screenLayout.test.ts).
//
// Four separate things — never mixed up:
//  1. physical position of the device (sensors: NOT read here);
//  2. area the browser gives the page (innerWidth/innerHeight, visualViewport);
//  3. the scoreboard layout chosen from (2) and the operator's preference;
//  4. full screen / orientation lock requests (may be refused or missing).

export type LayoutPref = "auto" | "camera" | "padrao";
export const LAYOUT_PREF_KEY = "lbl:placar:layout2";

export function parseLayoutPref(v: unknown): LayoutPref {
  return v === "camera" || v === "padrao" ? v : "auto";
}

/** Landscape = the AREA the page actually has is wider than tall (not window.screen, not sensors). */
export function isLandscapeArea(w: number, h: number): boolean {
  return w > 0 && h > 0 && w > h;
}

/** "auto": camera layout when the page area is horizontal; otherwise as chosen. */
export function chooseLayout(pref: LayoutPref, landscape: boolean): "camera" | "padrao" {
  if (pref === "camera") return "camera";
  if (pref === "padrao") return "padrao";
  return landscape ? "camera" : "padrao";
}

export const ROTATE_HINT = "Confira se a rotação automática do aparelho está ativada e gire o celular.";
export const LOCK_FAILED = "Não foi possível girar automaticamente. Ative a rotação automática e deite o aparelho.";

export type ScreenInfo = {
  innerWidth: number;
  innerHeight: number;
  visualWidth: number | null;
  visualHeight: number | null;
  mqLandscape: boolean | null;
  orientationType: string | null;
  orientationAngle: number | null;
  fullscreenElement: string | null;
  canFullscreen: boolean;
  canLock: boolean;
  standalone: boolean;
};

/** Plain-text diagnostics — technical facts only (no tokens, credentials or personal data). */
export function diagnosticsText(i: ScreenInfo, extra: { layout: string; pref: LayoutPref; version: string; lastError: string | null; userAgent: string }): string {
  const yn = (b: boolean | null) => (b == null ? "indisponível" : b ? "sim" : "não");
  return [
    "Diagnóstico de tela — placar LBL",
    `Janela (área da página): ${i.innerWidth} × ${i.innerHeight} → ${isLandscapeArea(i.innerWidth, i.innerHeight) ? "horizontal" : "vertical"}`,
    `Área visual (visualViewport): ${i.visualWidth != null ? `${Math.round(i.visualWidth)} × ${Math.round(i.visualHeight ?? 0)}` : "indisponível"}`,
    `matchMedia (orientation: landscape): ${yn(i.mqLandscape)}`,
    `screen.orientation: ${i.orientationType ?? "indisponível"}${i.orientationAngle != null ? ` (${i.orientationAngle}°)` : ""}`,
    `Em tela cheia: ${i.fullscreenElement ?? "não"}`,
    `requestFullscreen disponível: ${yn(i.canFullscreen)}`,
    `screen.orientation.lock disponível: ${yn(i.canLock)}`,
    `Aplicativo instalado (standalone): ${yn(i.standalone)}`,
    `Layout do placar: ${extra.layout} (preferência: ${extra.pref})`,
    `Versão do aplicativo: ${extra.version}`,
    `Último erro de tela cheia/orientação: ${extra.lastError ?? "nenhum"}`,
    `Navegador: ${extra.userAgent}`,
  ].join("\n");
}

/** Error → "Name: message" for the diagnostics (never shown as a success). */
export function describeError(e: unknown): string {
  if (e && typeof e === "object") {
    const n = "name" in e ? String((e as { name: unknown }).name) : "Erro";
    const m = "message" in e ? String((e as { message: unknown }).message) : "";
    return `${n}${m ? `: ${m}` : ""}`.slice(0, 200);
  }
  return String(e).slice(0, 200);
}
