"use client";

import { useEffect, useRef, useState } from "react";

// Full-screen "3 · 2 · 1 · GO · SHOOT" countdown. Plays the real audio clip
// (public/countdown.mp3) and switches the on-screen number at each word's
// measured onset. LBL identity: black background, yellow arrows, red text.
//
// All critical layout/size uses INLINE styles (not Tailwind arbitrary values)
// so it renders identically on every browser, including iOS/iPadOS Safari.

type Step = { label: string; at: number; kind: "num" | "go" | "shoot" };

const STEPS: Step[] = [
  { label: "3", at: 0.15, kind: "num" },
  { label: "2", at: 2.3, kind: "num" },
  { label: "1", at: 3.35, kind: "num" },
  { label: "GO", at: 4.05, kind: "go" },
  { label: "SHOOT", at: 5.35, kind: "shoot" },
];
const END_AT = 6.8;

const YELLOW = "#f0a500";
const RED = "#e5122e";

// Font size per token — sized so even the widest word (with arrows) never gets
// clipped horizontally. Wider words use a smaller font.
const FONT: Record<Step["kind"], string> = {
  num: "min(50vw, 78vh)",
  go: "min(34vw, 52vh)",
  shoot: "min(17vw, 32vh)",
};

export default function CountdownOverlay({
  onDone,
  offsetMs = 0,
  audioEl = null,
}: {
  onDone: () => void;
  offsetMs?: number;
  audioEl?: HTMLAudioElement | null;
}) {
  const initialIdx = STEPS.reduce((acc, s, i) => (s.at * 1000 <= offsetMs ? i : acc), 0);
  const [idx, setIdx] = useState(initialIdx);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const off = Math.max(0, offsetMs);

    function finish() {
      if (!doneRef.current && !cancelled) {
        doneRef.current = true;
        onDone();
      }
    }

    STEPS.forEach((step, i) => {
      const delay = step.at * 1000 - off;
      if (delay > 0) timers.push(setTimeout(() => { if (!cancelled) setIdx(i); }, delay));
    });
    timers.push(setTimeout(finish, Math.max(0, END_AT * 1000 - off)));

    const audio = audioEl ?? new Audio("/countdown.mp3");
    audio.volume = 1;
    try { audio.currentTime = off > 0 ? off / 1000 : 0; } catch { /* ignore */ }
    audio.play().catch(() => { /* best-effort; visual timeline still runs */ });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = STEPS[idx];
  const showLeftArrow = step.kind !== "shoot";
  const showRightArrow = step.kind === "go" || step.label === "1";

  const arrowSize = "min(12vw, 18vh)";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "3vw",
        background: "#000",
        zIndex: 70,
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {showLeftArrow && (
        <Arrow color={YELLOW} size={arrowSize} flip={false} dim={step.kind === "num" && step.label !== "3"} />
      )}

      <span
        key={step.label}
        style={{
          fontWeight: 900,
          lineHeight: 1,
          fontFamily: "system-ui, sans-serif",
          fontSize: FONT[step.kind],
          color: RED,
          textShadow: `0 0 6vmin ${RED}88`,
          whiteSpace: "nowrap",
          maxWidth: "96vw",
        }}
      >
        {step.label}
      </span>

      {showRightArrow && <Arrow color={YELLOW} size={arrowSize} flip dim={false} />}
    </div>
  );
}

function Arrow({ color, size, flip, dim }: { color: string; size: string; flip: boolean; dim: boolean }) {
  return (
    <svg
      viewBox="0 0 70 90"
      style={{
        width: size,
        height: "auto",
        opacity: dim ? 0 : 1,
        transform: flip ? "scaleX(-1)" : undefined,
        filter: `drop-shadow(0 0 2vmin ${color}88)`,
        flexShrink: 0,
      }}
    >
      <polygon points="0,0 70,45 0,90" fill={color} />
    </svg>
  );
}
