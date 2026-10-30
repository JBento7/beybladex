"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import FeaturedTournament from "./FeaturedTournament";
import type { FeaturedEvent } from "@/lib/homeData";

// "Torneios em destaque": every active event, one per slide (the data comes
// from the server page; changing slides never queries anything). This
// component only handles navigation, pause and the timer.
//  - Auto-advance every 6 s in a loop; the timer restarts after any manual
//    navigation and is suspended while hovered, while focus is inside, while
//    the tab is hidden, and after a manual pause (until the user resumes).
//  - prefers-reduced-motion: starts paused, no sliding animation.
//  - Hidden slides are `inert` (nothing inside can be focused or read); the
//    slide change never moves focus; the live region is silent while playing.
//  - Phone: horizontal swipe changes slides; vertical scrolling is untouched.
//  - Images: the first slide loads with priority, the others only when they
//    are about to be shown (current or next).
const INTERVAL_MS = 6000;
const SWIPE_PX = 48;

export default function FeaturedCarousel({ events, registeredIds }: { events: FeaturedEvent[]; registeredIds: string[] }) {
  const count = events.length;
  // The selection is kept by tournament id, so a refreshed list keeps showing
  // the same event; if it disappeared, the nearest valid slide is used.
  const [currentId, setCurrentId] = useState(events[0]?.id ?? null);
  const lastIndex = useRef(0);
  const found = events.findIndex((e) => e.id === currentId);
  const index = found >= 0 ? found : Math.min(lastIndex.current, Math.max(0, count - 1));
  useEffect(() => {
    lastIndex.current = index;
    if (found < 0 && events[index]) setCurrentId(events[index].id);
  }, [index, found, events]);

  const [reducedMotion, setReducedMotion] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  // Bumped on every manual navigation: restarts the 6 s countdown.
  const [manualTick, setManualTick] = useState(0);
  // Slides whose image may load (shown or about to be shown).
  const [reached, setReached] = useState<Set<string>>(() => new Set(events.slice(0, 2).map((e) => e.id)));

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReducedMotion(mq.matches);
      if (mq.matches) setUserPaused(true); // start without autoplay
    };
    apply();
    mq.addEventListener("change", apply);
    const onVisibility = () => setTabHidden(document.visibilityState === "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mq.removeEventListener("change", apply);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const goTo = useCallback((i: number, manual: boolean) => {
    if (count === 0) return;
    const next = ((i % count) + count) % count;
    setCurrentId(events[next].id);
    if (manual) setManualTick((t) => t + 1);
  }, [count, events]);

  // Images: current and next slide.
  useEffect(() => {
    const ids = [events[index]?.id, events[(index + 1) % Math.max(1, count)]?.id].filter((x): x is string => !!x);
    setReached((prev) => (ids.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ids])));
  }, [index, events, count]);

  const playing = count > 1 && !userPaused && !hovered && !focused && !tabHidden;
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => goTo(index + 1, false), INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [playing, index, manualTick, goTo]);

  // Swipe (touch only; horizontal intent only, so vertical scrolling stays native).
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    touch.current = { x: p.clientX, y: p.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(index + (dx < 0 ? 1 : -1), true);
  };

  if (count === 0) return null;
  const registered = new Set(registeredIds);
  if (count === 1) {
    // A single event: the static card, no controls, no timer.
    return <FeaturedTournament event={events[0]} registered={registered.has(events[0].id)} cover="priority" />;
  }

  const ctrl = "inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full border border-line bg-card text-fg hover:bg-field focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";
  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Torneios em destaque"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setHovered(false); }}
      // Keyboard focus only (a mouse click on an arrow is not :focus-visible).
      onFocus={(e) => { if ((e.target as HTMLElement).matches?.(":focus-visible")) setFocused(true); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
    >
      <div className="overflow-hidden rounded-card" style={{ touchAction: "pan-y" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          className={`flex items-stretch ${reducedMotion ? "" : "transition-transform duration-300 ease-out"}`}
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {events.map((e, i) => {
            const active = i === index;
            return (
              <div
                key={e.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} de ${count}: ${e.name}`}
                aria-hidden={!active}
                inert={!active}
                className="w-full shrink-0 flex"
              >
                <FeaturedTournament
                  event={e}
                  registered={registered.has(e.id)}
                  headingId={`destaque-titulo-${e.id}`}
                  cover={i === 0 ? "priority" : reached.has(e.id) ? "lazy" : "none"}
                  className="w-full"
                  prefetch={false}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <button type="button" className={ctrl} aria-label="Torneio anterior" onClick={() => goTo(index - 1, true)}>
          <ChevronLeft aria-hidden="true" className="w-5 h-5" />
        </button>
        <div className="flex flex-wrap items-center justify-center" role="group" aria-label="Escolher torneio">
          {events.map((e, i) => (
            <button
              key={e.id}
              type="button"
              aria-label={`Mostrar torneio ${i + 1}: ${e.name}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => goTo(i, true)}
              className="group inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-brand-yellow"
            >
              <span
                aria-hidden="true"
                className={`block h-2.5 rounded-full ${reducedMotion ? "" : "transition-all duration-300"} ${i === index ? "w-6 bg-brand-yellow" : "w-2.5 bg-fg-3 group-hover:bg-fg-2"}`}
              />
            </button>
          ))}
        </div>
        <button type="button" className={ctrl} aria-label="Próximo torneio" onClick={() => goTo(index + 1, true)}>
          <ChevronRight aria-hidden="true" className="w-5 h-5" />
        </button>
        <button
          type="button"
          className={`${ctrl} px-3 gap-1.5 text-small font-semibold`}
          aria-pressed={userPaused}
          onClick={() => { setUserPaused((p) => !p); setManualTick((t) => t + 1); }}
        >
          {userPaused ? <Play aria-hidden="true" className="w-4 h-4" /> : <Pause aria-hidden="true" className="w-4 h-4" />}
          {userPaused ? "Retomar" : "Pausar"}
          <span className="sr-only"> a troca automática</span>
        </button>
        {/* Silent while auto-advancing; announced when the user is in control. */}
        <p className="min-w-[4.5rem] text-center text-small text-fg-2 tabular-nums" aria-live={playing ? "off" : "polite"} aria-atomic="true">
          {index + 1} de {count}
        </p>
      </div>
    </section>
  );
}
