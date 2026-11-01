"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { wrapIndex } from "@/lib/gallery";

// Gallery at the top of a tournament page (docs/GALERIA.md). Images may hold
// rules, schedules and prizes, so: shown WHOLE (object-contain on a neutral
// background, fixed frame so the page never jumps), never auto-advancing,
// arrows + indicators + "2 de 5" counter, swipe on touch, wrap-around, and a
// tap opens an enlarged view with zoom. One image: static (no controls).

export type GalleryImage = { src: string; thumb: string; alt: string; width?: number | null; height?: number | null };

const altOf = (img: GalleryImage, i: number, n: number, name: string) =>
  img.alt || (n > 1 ? `Imagem ${i + 1} de ${n} do ${name}` : `Imagem do ${name}`);

export default function TournamentGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const n = images.length;
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const go = useCallback((d: number) => setIndex((i) => wrapIndex(i + d, n)), [n]);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Swipe (touch/pen; a mouse drags nothing).
  const start = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { if (e.pointerType !== "mouse") start.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current; start.current = null;
    if (!s || n < 2) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { swipedAt.current = Date.now(); go(dx < 0 ? 1 : -1); }
  };
  // A click fired right after a swipe isn't a tap (it must not open the
  // enlarged view); a later tap always is.
  const swipedAt = useRef(0);

  if (n === 0) return null;
  const many = n > 1;

  return (
    <div
      role={many ? "region" : undefined}
      aria-roledescription={many ? "carrossel" : undefined}
      aria-label={many ? `Imagens do ${name}` : undefined}
      className="relative bg-[#141414]"
      onKeyDown={(e) => { if (!many) return; if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); } else if (e.key === "ArrowRight") { e.preventDefault(); go(1); } }}
    >
      {/* Fixed frame: switching slides never moves the content below. */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/9] max-h-[70vh]" onPointerDown={onDown} onPointerUp={onUp} style={{ touchAction: "pan-y" }}>
        {images.map((img, i) => {
          // Only the current slide and its neighbors are mounted (others load on demand).
          const near = i === index || i === wrapIndex(index + 1, n) || i === wrapIndex(index - 1, n);
          if (!near) return null;
          const current = i === index;
          return (
            <button
              key={img.src}
              ref={current ? triggerRef : undefined}
              type="button"
              tabIndex={current ? 0 : -1}
              aria-hidden={!current}
              aria-label={`Ampliar imagem${many ? ` ${i + 1} de ${n}` : ""}`}
              onClick={() => { if (Date.now() - swipedAt.current < 350) return; setOpen(true); }}
              className={`absolute inset-0 w-full h-full cursor-zoom-in motion-safe:transition-opacity motion-safe:duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand-yellow ${current ? "opacity-100 z-[1]" : "opacity-0 pointer-events-none"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.src}
                alt={altOf(img, i, n, name)}
                width={img.width ?? undefined}
                height={img.height ?? undefined}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "low"}
                decoding="async"
                draggable={false}
                className="w-full h-full object-contain select-none"
              />
            </button>
          );
        })}
        {many && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Imagem anterior" className="absolute left-2 top-1/2 -translate-y-1/2 z-[2] w-11 h-11 rounded-full bg-black/60 text-white text-2xl leading-none flex items-center justify-center hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow">‹</button>
            <button type="button" onClick={() => go(1)} aria-label="Próxima imagem" className="absolute right-2 top-1/2 -translate-y-1/2 z-[2] w-11 h-11 rounded-full bg-black/60 text-white text-2xl leading-none flex items-center justify-center hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow">›</button>
            <span className="absolute top-2 right-2 z-[2] rounded-full bg-black/70 px-2.5 py-1 text-xs font-bold text-white" aria-live="polite">{index + 1} de {n}</span>
          </>
        )}
      </div>
      {many && (
        <div className="flex justify-center gap-1 py-1.5" role="group" aria-label="Escolher imagem">
          {images.map((img, i) => (
            <button
              key={img.src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ir para a imagem ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              className="w-7 h-7 flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow"
            >
              <span className={`block rounded-full ${i === index ? "w-3 h-3 bg-brand-yellow" : "w-2 h-2 bg-gray-500"}`} />
            </button>
          ))}
        </div>
      )}
      {open && <Lightbox images={images} index={index} setIndex={setIndex} name={name} onClose={() => { setOpen(false); triggerRef.current?.focus(); }} />}
    </div>
  );
}

function Lightbox({ images, index, setIndex, name, onClose }: {
  images: GalleryImage[]; index: number; setIndex: (f: (i: number) => number) => void; name: string; onClose: () => void;
}) {
  const n = images.length;
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const closeRef = useRef<HTMLButtonElement>(null);
  const reset = () => { setScale(1); setPan({ x: 0, y: 0 }); };
  const go = useCallback((d: number) => { setIndex((i) => wrapIndex(i + d, n)); setScale(1); setPan({ x: 0, y: 0 }); }, [n, setIndex]);
  const zoom = (f: number) => setScale((s) => { const v = Math.min(5, Math.max(1, s * f)); if (v === 1) setPan({ x: 0, y: 0 }); return v; });

  // Scroll lock while open — always restored on close/unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowLeft" && n > 1) go(-1);
      else if (e.key === "ArrowRight" && n > 1) go(1);
      else if (e.key === "+" || e.key === "=") zoom(1.5);
      else if (e.key === "-") zoom(1 / 1.5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, n, onClose]);

  // Pinch (two pointers), pan (one pointer while zoomed), swipe (one pointer at 1×).
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist?: number; scale0?: number; x0?: number; y0?: number; pan0?: { x: number; y: number } }>({});
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    if (p.length === 2) gesture.current = { dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), scale0: scale };
    else gesture.current = { x0: e.clientX, y0: e.clientY, pan0: pan };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()], g = gesture.current;
    if (p.length === 2 && g.dist) {
      setScale(Math.min(5, Math.max(1, g.scale0! * (Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / g.dist))));
    } else if (p.length === 1 && scale > 1 && g.pan0) {
      setPan({ x: g.pan0.x + (e.clientX - g.x0!), y: g.pan0.y + (e.clientY - g.y0!) });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pts.current.delete(e.pointerId);
    if (pts.current.size === 0 && scale === 1 && g.x0 !== undefined && n > 1) {
      const dx = e.clientX - g.x0, dy = e.clientY - (g.y0 ?? 0);
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    }
    if (scale <= 1.01) { setPan({ x: 0, y: 0 }); }
    gesture.current = {};
  };

  const img = images[index];
  const ctl = "min-w-[44px] h-11 px-3 rounded-full bg-white/10 text-white font-bold hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow";
  return (
    <div role="dialog" aria-modal="true" aria-label={`Imagem ampliada${n > 1 ? ` ${index + 1} de ${n}` : ""}`} className="fixed inset-0 z-[80] bg-black flex flex-col">
      <div className="flex items-center gap-2 p-2 shrink-0">
        {n > 1 && <span className="text-sm font-bold text-white px-2" aria-live="polite">{index + 1} de {n}</span>}
        <div className="flex-1" />
        <button type="button" className={ctl} onClick={() => zoom(1 / 1.5)} aria-label="Diminuir zoom" disabled={scale <= 1}>−</button>
        <button type="button" className={ctl} onClick={reset} aria-label="Tamanho original">{Math.round(scale * 100)}%</button>
        <button type="button" className={ctl} onClick={() => zoom(1.5)} aria-label="Aumentar zoom" disabled={scale >= 5}>+</button>
        <button ref={closeRef} type="button" className={`${ctl} bg-white text-black hover:bg-gray-200`} onClick={onClose} aria-label="Fechar imagem ampliada">✕ Fechar</button>
      </div>
      <div
        className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center"
        style={{ touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
        onDoubleClick={() => (scale > 1 ? reset() : setScale(2.5))}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.src}
          alt={altOf(img, index, n, name)}
          draggable={false}
          className="max-w-full max-h-full object-contain select-none"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, cursor: scale > 1 ? "grab" : "zoom-in" }}
        />
        {n > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Imagem anterior" className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 text-white text-3xl leading-none hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow">‹</button>
            <button type="button" onClick={() => go(1)} aria-label="Próxima imagem" className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 text-white text-3xl leading-none hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow">›</button>
          </>
        )}
      </div>
      {img.alt && <p className="shrink-0 px-4 py-2 text-center text-sm text-gray-300">{img.alt}</p>}
    </div>
  );
}
