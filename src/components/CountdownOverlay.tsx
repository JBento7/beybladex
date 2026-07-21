"use client";

import { useEffect, useRef, useState } from "react";

// Full-screen "3 · 2 · 1 · GO · SHOOT" countdown with browser speech narration,
// matching the Beyblade X match-start call. Calls onDone when finished.

type Step = { label: string; say: string; kind: "num" | "go" | "shoot" };

const STEPS: Step[] = [
  { label: "3", say: "3", kind: "num" },
  { label: "2", say: "2", kind: "num" },
  { label: "1", say: "1", kind: "num" },
  { label: "GO", say: "go", kind: "go" },
  { label: "SHOOT", say: "shoot", kind: "shoot" },
];

const STEP_MS = 750;
const SHOOT_MS = 1100;

export default function CountdownOverlay({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;

    function finish() {
      if (!doneRef.current && !cancelled) {
        doneRef.current = true;
        onDone();
      }
    }

    // Pure-timer fallback: advance visuals on a fixed cadence (used when speech
    // is unavailable or never starts).
    function runTimers(fromStep = 0) {
      let acc = 0;
      for (let i = fromStep; i < STEPS.length; i++) {
        const step = STEPS[i];
        timers.push(setTimeout(() => { if (!cancelled) setIdx(i); }, acc));
        acc += step.kind === "shoot" ? SHOOT_MS : STEP_MS;
      }
      timers.push(setTimeout(finish, acc));
    }

    if (!synth) {
      runTimers();
      return () => { cancelled = true; timers.forEach(clearTimeout); };
    }

    // Speech-driven: the visual for each step is shown exactly when that step's
    // utterance actually *starts* speaking (onstart), so audio and numbers stay
    // in sync instead of the audio lagging behind timer-driven visuals.
    try { synth.cancel(); } catch { /* ignore */ }

    let anyStarted = false;

    STEPS.forEach((step, i) => {
      const u = new SpeechSynthesisUtterance(step.say);
      u.lang = "en-US";
      u.rate = 1.05;
      u.pitch = 1;
      u.volume = 1;
      u.onstart = () => {
        anyStarted = true;
        if (!cancelled) setIdx(i);
      };
      if (i === STEPS.length - 1) {
        // Hold SHOOT briefly after it's spoken, then finish.
        u.onend = () => { timers.push(setTimeout(finish, 450)); };
      }
      try { synth.speak(u); } catch { /* ignore */ }
    });

    // If speech never actually starts (blocked/muted/autoplay policy), fall back
    // to the timer cadence so the countdown still runs.
    timers.push(
      setTimeout(() => {
        if (!anyStarted && !cancelled) {
          try { synth.cancel(); } catch { /* ignore */ }
          runTimers();
        }
      }, 500)
    );

    // Absolute safety net so onDone always fires even if speech stalls mid-way.
    timers.push(setTimeout(finish, 7000));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      try { synth.cancel(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = STEPS[idx];
  const arrowColor = "#22c55e";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#eef2f0] select-none">
      <div className="flex items-center gap-6 sm:gap-10">
        {/* left arrow for numbers/go */}
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
