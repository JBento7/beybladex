"use client";

import { useEffect, useRef, useState } from "react";

// Full-screen "3 · 2 · 1 · GO · SHOOT" countdown. Plays the real audio clip
// (public/countdown.mp3) and switches the on-screen number at each word's
// measured onset so the visuals stay locked to the audio. Calls onDone when
// finished. LBL identity: black background, yellow arrows, red text.

type Step = { label: string; at: number; kind: "num" | "go" | "shoot" };

// Word onsets (seconds) measured from the audio energy envelope. GO and SHOOT
// hold long to match the drawn-out "GOooo"/"SHOOoot" in the clip.
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

export default function CountdownOverlay({ onDone, offsetMs = 0 }: { onDone: () => void; offsetMs?: number }) {
  // Start at whichever step the offset lands in (for the arena, which may begin
  // the countdown a fraction of a second after the judge triggered it).
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
    const endDelay = END_AT * 1000 - off;
    timers.push(setTimeout(finish, Math.max(0, endDelay)));

    const audio = new Audio("/countdown.mp3");
    audio.volume = 1;
    if (off > 0) {
      try { audio.currentTime = off / 1000; } catch { /* ignore */ }
    }
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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black select-none">
      <div className="flex items-center gap-6 sm:gap-10">
        {step.kind !== "shoot" && (
          <Arrow dir="right" color={YELLOW} dim={step.kind === "num" && step.label !== "3"} />
        )}

        <span
          key={step.label}
          className={`font-black leading-none animate-[pop_0.25s_ease-out] ${
            step.kind === "shoot"
              ? "text-[22vw] sm:text-[190px] tracking-tight"
              : step.kind === "go"
              ? "text-[26vw] sm:text-[210px]"
              : "text-[34vw] sm:text-[250px]"
          }`}
          style={{ color: RED, textShadow: `0 0 40px ${RED}66` }}
        >
          {step.label}
        </span>

        {(step.kind === "go" || step.label === "1") && step.kind !== "shoot" && (
          <Arrow dir="left" color={YELLOW} dim={false} />
        )}
      </div>

      <style>{`
        @keyframes pop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function Arrow({ dir, color, dim }: { dir: "left" | "right"; color: string; dim: boolean }) {
  return (
    <svg
      width="70"
      height="90"
      viewBox="0 0 70 90"
      className="w-[10vw] max-w-[80px] h-auto"
      style={{ opacity: dim ? 0 : 1, transform: dir === "left" ? "scaleX(-1)" : undefined, filter: `drop-shadow(0 0 12px ${color}88)` }}
    >
      <polygon points="0,0 70,45 0,90" fill={color} />
    </svg>
  );
}
