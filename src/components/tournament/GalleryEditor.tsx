"use client";

import { useEffect, useRef, useState } from "react";
import { GALLERY_ALT_MAX, GALLERY_MAX_BYTES, GALLERY_MAX_IMAGES } from "@/lib/gallery";

// "Imagens do campeonato" (docs/GALERIA.md): cover + up to 9 extra images.
// Each file is uploaded on selection (with progress); the gallery itself is
// only saved with the tournament form, which must wait for pending uploads
// (`onState`). A failed upload can be retried or removed without touching the
// other images.

export type GalleryEntry = {
  key: string;
  imageId: string | null;
  url: string | null; // pre-gallery cover link (kept as is)
  thumb: string | null;
  alt: string;
  status: "ready" | "uploading" | "error";
  progress: number;
  error?: string;
  file?: File;
};
export type GalleryPayload = { imageId?: string; url?: string; alt: string; isCover: boolean }[];

let seq = 0;
const newKey = () => `g${Date.now().toString(36)}${(seq++).toString(36)}`;
const ACCEPT = "image/jpeg,image/png,image/webp";
// The hosting platform caps a request near 4.5 MB: a file between 4 and 5 MB is
// reduced in the browser (same proportions, max 3000 px) before upload. Files
// above 5 MB are refused; the server validates the content and the limit again.
const SEND_LIMIT = 4 * 1024 * 1024;

async function shrinkIfNeeded(file: File): Promise<Blob> {
  if (file.size <= SEND_LIMIT) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  for (const q of [0.9, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, file.type === "image/png" ? "image/webp" : file.type, q));
    if (blob && blob.size <= SEND_LIMIT) return blob;
  }
  throw new Error("Não foi possível reduzir a imagem abaixo do limite. Use um arquivo menor.");
}

function upload(blob: Blob, name: string, onProgress: (p: number) => void): Promise<{ id: string; thumb: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/tournament-images");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let d: { id?: string; thumb?: string; error?: string } = {};
      try { d = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && d.id) resolve({ id: d.id, thumb: d.thumb! });
      else reject(new Error(d.error || `Falha no envio (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Sem conexão. Toque em “Tentar de novo”."));
    const fd = new FormData();
    fd.append("file", blob, name);
    xhr.send(fd);
  });
}

export function galleryPayload(entries: GalleryEntry[], coverKey: string | null): GalleryPayload {
  return entries.filter((e) => e.status === "ready").map((e) => ({
    ...(e.imageId ? { imageId: e.imageId } : { url: e.url! }),
    alt: e.alt.trim(),
    isCover: e.key === coverKey,
  }));
}

export default function GalleryEditor({
  initial,
  onChange,
}: {
  initial: { imageId: string | null; url: string | null; thumb: string; alt: string; isCover: boolean }[];
  /** Called on every change: payload to save + whether saving must wait. */
  onChange: (payload: GalleryPayload, state: { pending: number; failed: number }) => void;
}) {
  const [init] = useState(() => {
    const list: GalleryEntry[] = initial.map((i) => ({ key: newKey(), imageId: i.imageId, url: i.url, thumb: i.thumb, alt: i.alt, status: "ready", progress: 100 }));
    const ci = initial.findIndex((x) => x.isCover);
    return { list, cover: list[ci >= 0 ? ci : 0]?.key ?? null };
  });
  const [entries, setEntries] = useState<GalleryEntry[]>(init.list);
  const [coverKey, setCoverKey] = useState<string | null>(init.cover);

  const [notice, setNotice] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceKey = useRef<string | null>(null);

  // Effective cover: the chosen one, or the first image.
  const cover = entries.find((e) => e.key === coverKey) ? coverKey : entries[0]?.key ?? null;
  useEffect(() => {
    onChange(galleryPayload(entries, cover), {
      pending: entries.filter((e) => e.status === "uploading").length,
      failed: entries.filter((e) => e.status === "error").length,
    });
  }, [entries, cover, onChange]);

  const patch = (key: string, p: Partial<GalleryEntry>) => setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...p } : e)));

  async function send(key: string, file: File) {
    patch(key, { status: "uploading", progress: 0, error: undefined, file });
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Formato não aceito. Envie JPEG, PNG ou WebP.");
      if (file.size > GALLERY_MAX_BYTES) throw new Error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). O limite é 5 MB.`);
      const blob = await shrinkIfNeeded(file);
      const r = await upload(blob, file.name, (p) => patch(key, { progress: p }));
      patch(key, { status: "ready", progress: 100, imageId: r.id, url: null, thumb: r.thumb, file: undefined });
    } catch (e) {
      patch(key, { status: "error", error: (e as Error).message });
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const room = GALLERY_MAX_IMAGES - entries.length;
    const list = [...files];
    if (list.length > room) setNotice(`Limite de ${GALLERY_MAX_IMAGES} imagens (capa incluída): ${list.length - room} não ${list.length - room === 1 ? "foi adicionada" : "foram adicionadas"}.`);
    else setNotice(null);
    const fresh = list.slice(0, Math.max(0, room)).map((file) => ({ key: newKey(), imageId: null, url: null, thumb: URL.createObjectURL(file), alt: "", status: "uploading" as const, progress: 0, file }));
    setEntries((l) => [...l, ...fresh]);
    for (const f of fresh) void send(f.key, f.file);
  }

  function replace(files: FileList | null) {
    const key = replaceKey.current;
    const file = files?.[0];
    if (!key || !file) return;
    patch(key, { thumb: URL.createObjectURL(file) });
    void send(key, file);
  }

  function move(key: string, d: -1 | 1) {
    setEntries((l) => {
      const i = l.findIndex((e) => e.key === key), j = i + d;
      if (i < 0 || j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }
  const remove = (key: string) => setEntries((l) => l.filter((e) => e.key !== key));

  const btn = "min-h-[40px] min-w-[40px] px-2 rounded-lg border border-line bg-card text-sm text-gray-200 hover:bg-hover disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow";
  const coverEntry = entries.find((e) => e.key === cover);

  return (
    <div className="space-y-3">
      <ul className="text-xs text-gray-400 space-y-1">
        <li><b className="text-gray-200">Capa:</b> aparece nos cards do torneio. Nos cards o formato é fixo (16:9), então as bordas da capa podem ser cortadas.</li>
        <li><b className="text-gray-200">Imagens adicionais:</b> aparecem na página de detalhes, inteiras e na ordem abaixo (a capa vem primeiro).</li>
        <li>JPEG, PNG ou WebP, até 5 MB cada, no máximo {GALLERY_MAX_IMAGES} imagens. Informações como data, local e valor continuam nos campos de texto.</li>
      </ul>

      {coverEntry?.thumb && (
        <div>
          <p className="text-xs text-gray-400 mb-1">Como a capa aparece nos cards:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverEntry.thumb} alt="" className="w-full max-w-xs aspect-video object-cover rounded-lg border border-line bg-field" />
        </div>
      )}

      {entries.length > 0 && (
        <ol className="space-y-2" aria-label="Imagens do campeonato">
          {entries.map((e, i) => (
            <li key={e.key} className={`rounded-xl border p-2 ${e.key === cover ? "border-brand-yellow" : "border-line"} bg-field`}>
              <div className="flex gap-3">
                <div className="relative w-24 h-24 shrink-0 rounded-lg overflow-hidden bg-card">
                  {e.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.thumb} alt="" className="w-full h-full object-contain" />
                  )}
                  {e.status === "uploading" && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs font-bold text-white" role="status" aria-live="polite">
                      Enviando {e.progress}%
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-gray-200">{i + 1}.</span>
                    {e.key === cover ? <span className="px-2 py-0.5 rounded-full bg-brand-yellow/20 text-amber-200 font-bold">Capa</span> : <span className="text-gray-400">Imagem adicional</span>}
                    {e.status === "uploading" && <progress max={100} value={e.progress} className="h-1.5 w-24" aria-label="Progresso do envio" />}
                  </div>
                  {e.status === "error" && (
                    <p role="alert" className="text-xs text-red-300">{e.error}</p>
                  )}
                  <label className="block text-xs text-gray-400">
                    Descrição da imagem (para leitores de tela)
                    <input
                      type="text"
                      value={e.alt}
                      maxLength={GALLERY_ALT_MAX}
                      onChange={(ev) => patch(e.key, { alt: ev.target.value })}
                      placeholder="ex.: Cartaz com horários e premiação"
                      className="mt-1 w-full bg-card border border-line rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-yellow"
                    />
                  </label>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <label className={`${btn} inline-flex items-center gap-1.5 cursor-pointer`}>
                  <input type="radio" name="gallery-cover" checked={e.key === cover} onChange={() => setCoverKey(e.key)} disabled={e.status !== "ready"} className="accent-brand-yellow" />
                  Usar como capa
                </label>
                <button type="button" className={btn} onClick={() => move(e.key, -1)} disabled={i === 0} aria-label={`Mover imagem ${i + 1} para cima`}>↑</button>
                <button type="button" className={btn} onClick={() => move(e.key, 1)} disabled={i === entries.length - 1} aria-label={`Mover imagem ${i + 1} para baixo`}>↓</button>
                {e.status === "error" && e.file && (
                  <button type="button" className={btn} onClick={() => send(e.key, e.file!)}>Tentar de novo</button>
                )}
                <button type="button" className={btn} disabled={e.status === "uploading"} onClick={() => { replaceKey.current = e.key; replaceRef.current?.click(); }}>Substituir</button>
                <button type="button" className={`${btn} text-red-300`} onClick={() => remove(e.key)} aria-label={`Remover imagem ${i + 1}`}>Remover</button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {notice && <p className="text-xs text-amber-300" role="status">{notice}</p>}
      <div>
        <button type="button" onClick={() => addRef.current?.click()} disabled={entries.length >= GALLERY_MAX_IMAGES} className="min-h-[44px] px-4 rounded-lg border border-dashed border-line text-sm font-bold text-gray-200 hover:bg-hover disabled:opacity-40">
          {entries.length === 0 ? "＋ Enviar capa e imagens" : `＋ Adicionar imagens (${entries.length}/${GALLERY_MAX_IMAGES})`}
        </button>
        <input ref={addRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={replaceRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { replace(e.target.files); e.target.value = ""; }} />
      </div>
    </div>
  );
}
