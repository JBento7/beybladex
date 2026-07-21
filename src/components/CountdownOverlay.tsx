"use client";

import { useEffect, useRef, useState } from "react";

// Full-screen "3 · 2 · 1 · GO · SHOOT" countdown that plays the real audio clip
// (public/countdown.mp3) and switches the on-screen number at each word's onset
// so the visuals stay in sync with the audio. Calls onDone when finished.

type Step = { label: string; at: number; kind: "num" | "go" | "shoot" };

// Word onsets (seconds) measured from the audio energy envelope, nudged slightly
// early so the number never lands after the sound.
const STEPS: Step[] = [
  { label: "3", at: 0.15, kind: "num" },
  { label: "2", at: 2.15, kind: "num" },
  { label: "1", at: 3.4, kind: "num" },
  { label: "GO", at: 4.3, kind: "go" },
  { label: "SHOOT", at: 5.3, kind: "shoot" },
];
const END_AT = 6.8;

export default function CountdownOverlay({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function finish() {
      if (!doneRef.current && !cancelled) {
        doneRef.current = true;
        onDone();
      }
    }

    // Schedule the visual steps on the audio timeline.
    STEPS.forEach((step, i) => {
      timers.push(setTimeout(() => { if (!cancelled) setIdx(i); }, step.at * 1000));
    });
    timers.push(setTimeout(finish, END_AT * 1000));

    // Play the real audio clip. Triggered by the judge's click, so autoplay
    // policies allow it. If playback fails, the visual timeline still runs.
    const audio = new Audio("/countdown.mp3");
    audio.volume = 1;
    audio.play().catch(() => { /* audio best-effort */ });

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
  const arrowColor = "#22c55e";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#eef2f0] select-none">
      <div className="flex items-center gap-6 sm:gap-10">
        {step.kind !== "shoot" && (
          <Arrow dir="right" color={arrowColor} dim={step.kind === "num" && step.label !== "3"} />
        )}

        <span
          key={step.label}
          className={`font-black leading-none animate-[pop_0.25s_ease-out] ${
            step.kind === "shoot"
              ? "text-[22vw] sm:text-[180px] text-[#1a1a1a] tracking-tight"
              : step.kind === "go"
              ? "text-[26vw] sm:text-[200px] text-[#4b5563]"
              : "text-[34vw] sm:text-[240px] text-[#1a1a1a]"
          }`}
        >
          {step.label}
        </span>

        {(step.kind === "go" || step.label === "1") && step.kind !== "shoot" && (
          <Arrow dir="left" color={arrowColor} dim={false} />
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
      className="w-[10vw] max-w-[70px] h-auto"
      style={{ opacity: dim ? 0 : 1, transform: dir === "left" ? "scaleX(-1)" : undefined }}
    >
      <polygon points="0,0 70,45 0,90" fill={color} />
    </svg>
  );
}
