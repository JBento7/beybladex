// Client side of the published layouts (docs/EDITOR-LAYOUT.md): fetch the
// newest published compositions and get their assets ready BEFORE they are
// shown, so a telão never switches to a half-loaded layout.
import type { Composition, FontDef, Screen } from "@/lib/layoutDoc";

export type PublishedSet = Partial<Record<Screen, { version: number; composition: Composition }>>;

export async function fetchPublished(screens: Screen[]): Promise<PublishedSet> {
  const res = await fetch(`/api/arena-layout/published?screens=${screens.join(",")}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`layout ${res.status}`);
  const d = await res.json();
  return (d?.screens ?? {}) as PublishedSet;
}

function loadImage(url: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const t = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    img.onload = () => { clearTimeout(t); resolve(); };
    img.onerror = () => { clearTimeout(t); reject(new Error("image")); };
    img.src = url;
  });
}

async function loadFont(f: FontDef, timeoutMs = 4000): Promise<void> {
  try {
    if (f.kind === "upload" && f.src && typeof FontFace !== "undefined") {
      const face = new FontFace(f.family, `url(${f.src})`);
      await face.load();
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
      return;
    }
    if (f.kind === "google") {
      const id = `gf-${f.family.replace(/\W+/g, "-")}`;
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, "+")}&display=swap`;
        document.head.appendChild(link);
      }
      await Promise.race([document.fonts?.load(`16px '${f.family}'`), new Promise((r) => setTimeout(r, timeoutMs))]);
    }
  } catch { /* a font that fails falls back to the default typeface */ }
}

/**
 * Backgrounds must load (otherwise this throws and the caller keeps the
 * previous layout); fonts are best-effort with a timeout.
 */
export async function prepareAssets(bgs: (string | null | undefined)[], fonts: FontDef[]): Promise<void> {
  await Promise.all(bgs.filter((b): b is string => !!b).map((b) => loadImage(b)));
  await Promise.all(fonts.map((f) => loadFont(f)));
}

/** Stable id of this telão (for load confirmations; no personal data). */
export function deviceId(): string {
  const KEY = "lbl:telao:dispositivo";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = `t${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`; localStorage.setItem(KEY, id); }
    return id;
  } catch {
    return `t${Math.random().toString(36).slice(2, 12)}`;
  }
}
