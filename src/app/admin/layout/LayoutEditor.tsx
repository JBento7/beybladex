"use client";

import { useEffect, useRef, useState } from "react";
import { SCOREBOARD_DEFAULTS, pipDots, type Field } from "@/lib/arenaLayout";

const KEYS = Object.keys(SCOREBOARD_DEFAULTS);

// Representative content shown in the editor so positions are easy to judge.
const SAMPLE: Record<string, string> = {
  nameL: "NOME JOGADOR",
  nameR: "NOME JOGADOR",
  beyNameL: "NOME DO BEY",
  beyNameR: "NOME DO BEY",
  scoreL: "3",
  scoreR: "0",
  rodada: "01",
  partida: "03 / 08",
  status: "AO VIVO",
  evento: "CAMPEONATO",
  fase: "Rodada 1",
  local: "Londrina/PR",
  obs: "—",
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function r1(v: number) {
  return Math.round(v * 10) / 10;
}

export default function LayoutEditor({ initial }: { initial: Record<string, Field> }) {
  const [fields, setFields] = useState<Record<string, Field>>(() => {
    const f: Record<string, Field> = {};
    for (const k of KEYS) f[k] = { ...SCOREBOARD_DEFAULTS[k], ...(initial?.[k] || {}) };
    return f;
  });
  const [sel, setSel] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { key: string; mode: "move" | "resize"; startX: number; startY: number; orig: Field }>(null);

  function pct(clientX: number, clientY: number) {
    const el = boardRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 };
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = drag.current;
      if (!d) return;
      const p = pct(e.clientX, e.clientY);
      const def = SCOREBOARD_DEFAULTS[d.key];
      setFields((prev) => {
        const cur: Field = { ...prev[d.key] };
        if (d.mode === "move") {
          cur.x = clamp(r1(d.orig.x + (p.x - d.startX)), 0, 100);
          cur.y = clamp(r1(d.orig.y + (p.y - d.startY)), 0, 100);
        } else if (def.kind === "img") {
          cur.w = clamp(r1((d.orig.w ?? 10) + (p.x - d.startX)), 1, 100);
          cur.h = clamp(r1((d.orig.h ?? 10) + (p.y - d.startY)), 1, 100);
        } else {
          cur.fs = Math.max(0.4, r1((d.orig.fs ?? 1.5) + (p.y - d.startY) * 0.18));
        }
        return { ...prev, [d.key]: cur };
      });
    }
    function onUp() {
      drag.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function startDrag(e: React.PointerEvent, key: string, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    const p = pct(e.clientX, e.clientY);
    drag.current = { key, mode, startX: p.x, startY: p.y, orig: { ...fields[key] } };
    setSel(key);
  }

  function upd(key: string, patch: Partial<Field>) {
    setFields((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  function resetField(key: string) {
    setFields((prev) => ({ ...prev, [key]: { ...SCOREBOARD_DEFAULTS[key] } }));
  }
  function resetAll() {
    const f: Record<string, Field> = {};
    for (const k of KEYS) f[k] = { ...SCOREBOARD_DEFAULTS[k] };
    setFields(f);
    setSel(null);
  }
  async function save() {
    setStatus("saving");
    try {
      const res = await fetch("/api/arena-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "scoreboard", layout: fields }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus(""), 2500);
  }

  const selField = sel ? fields[sel] : null;
  const selDef = sel ? SCOREBOARD_DEFAULTS[sel] : null;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Board */}
      <div className="flex-1 min-w-0">
        <div
          ref={boardRef}
          onPointerDown={() => setSel(null)}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1672 / 941",
            containerType: "size",
            backgroundImage: "url(/scoreboard-bg.png)",
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
            borderRadius: 8,
            overflow: "hidden",
            fontFamily: "'Arial Black', system-ui, sans-serif",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          {KEYS.map((k) => {
            const f = fields[k];
            const def = SCOREBOARD_DEFAULTS[k];
            const isSel = sel === k;
            const outline = isSel ? "2px solid #f0a500" : "1px dashed rgba(255,255,255,0.35)";
            if (def.kind === "text") {
              return (
                <div
                  key={k}
                  onPointerDown={(e) => startDrag(e, k, "move")}
                  style={{
                    position: "absolute",
                    left: `${f.x}%`,
                    top: `${f.y}%`,
                    transform: "translate(-50%, -50%)",
                    width: `${f.w ?? 12}%`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: `${f.fs ?? 1.5}cqw`,
                    fontWeight: 900,
                    color: "#fff",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    outline,
                    cursor: "move",
                    zIndex: isSel ? 20 : 10,
                  }}
                >
                  {SAMPLE[k] ?? def.label}
                  {isSel && (
                    <span
                      onPointerDown={(e) => startDrag(e, k, "resize")}
                      title="Arraste para o tamanho da fonte"
                      style={{ position: "absolute", right: -7, bottom: -7, width: 14, height: 14, background: "#f0a500", borderRadius: 3, cursor: "nwse-resize" }}
                    />
                  )}
                </div>
              );
            }
            const isPip = def.kind === "pipsV" || def.kind === "pipsH";
            const dots = isPip ? pipDots(f, def.kind === "pipsV" ? "v" : "h") : [];
            return (
              <div
                key={k}
                onPointerDown={(e) => startDrag(e, k, "move")}
                style={{
                  position: "absolute",
                  left: `${f.x}%`,
                  top: `${f.y}%`,
                  width: `${f.w ?? 10}%`,
                  height: `${f.h ?? 10}%`,
                  background: isPip ? "rgba(240,165,0,0.06)" : "rgba(240,165,0,0.14)",
                  outline,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1cqw",
                  fontWeight: 800,
                  color: "#ffd400",
                  cursor: "move",
                  zIndex: isSel ? 20 : 10,
                }}
              >
                {isPip
                  ? dots.map((d, i) => (
                      <span
                        key={i}
                        style={{
                          position: "absolute",
                          left: `${((d.cx - f.x) / (f.w || 1)) * 100}%`,
                          top: `${((d.cy - f.y) / (f.h || 1)) * 100}%`,
                          transform: "translate(-50%, -50%)",
                          width: `${f.fs ?? 1.5}cqw`,
                          height: `${f.fs ?? 1.5}cqw`,
                          borderRadius: "50%",
                          background: "#ffd400",
                        }}
                      />
                    ))
                  : def.label}
                {isSel && (
                  <span
                    onPointerDown={(e) => startDrag(e, k, "resize")}
                    title="Arraste para dimensionar"
                    style={{ position: "absolute", right: -7, bottom: -7, width: 14, height: 14, background: "#f0a500", borderRadius: 3, cursor: "nwse-resize" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-72 shrink-0 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={save} className="flex-1 bg-[#22c55e] hover:bg-[#1ea34d] text-black font-black py-2 rounded-lg transition-colors">
            {status === "saving" ? "Salvando…" : status === "saved" ? "Salvo ✓" : status === "error" ? "Erro" : "Salvar"}
          </button>
          <button onClick={resetAll} className="text-xs text-gray-400 hover:text-white border border-[#333] rounded-lg px-3 py-2">Resetar tudo</button>
        </div>

        {selDef && selField ? (
          <div className="space-y-2">
            <div className="text-sm font-black text-[#f0a500]">{selDef.label}</div>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label="X %" value={selField.x} onChange={(v) => upd(sel!, { x: v })} />
              <NumberInput label="Y %" value={selField.y} onChange={(v) => upd(sel!, { y: v })} />
              {selDef.kind === "img" ? (
                <>
                  <NumberInput label="Larg %" value={selField.w ?? 10} onChange={(v) => upd(sel!, { w: v })} />
                  <NumberInput label="Alt %" value={selField.h ?? 10} onChange={(v) => upd(sel!, { h: v })} />
                </>
              ) : selDef.kind === "pipsV" || selDef.kind === "pipsH" ? (
                <>
                  <NumberInput label="Larg %" value={selField.w ?? 5} onChange={(v) => upd(sel!, { w: v })} />
                  <NumberInput label="Alt %" value={selField.h ?? 5} onChange={(v) => upd(sel!, { h: v })} />
                  <NumberInput label="Bolinha" value={selField.fs ?? 1.5} step={0.1} onChange={(v) => upd(sel!, { fs: v })} />
                </>
              ) : (
                <>
                  <NumberInput label="Larg %" value={selField.w ?? 12} onChange={(v) => upd(sel!, { w: v })} />
                  <NumberInput label="Fonte" value={selField.fs ?? 1.5} step={0.1} onChange={(v) => upd(sel!, { fs: v })} />
                </>
              )}
            </div>
            <button onClick={() => resetField(sel!)} className="text-xs text-gray-400 hover:text-white underline">
              resetar este item
            </button>
          </div>
        ) : (
          <div className="text-xs text-gray-500">Clique num elemento para selecioná-lo. Arraste para mover; a alça amarela dimensiona.</div>
        )}

        <div className="mt-4 border-t border-[#2a2a2a] pt-3">
          <div className="text-[11px] text-gray-500 mb-1">Elementos</div>
          <div className="grid grid-cols-2 gap-1">
            {KEYS.map((k) => (
              <button
                key={k}
                onClick={() => setSel(k)}
                className={`text-[11px] text-left px-2 py-1 rounded ${sel === k ? "bg-[#f0a500] text-black font-bold" : "text-gray-300 hover:bg-[#252525]"}`}
              >
                {SCOREBOARD_DEFAULTS[k].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange, step = 0.5 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="text-[11px] text-gray-400">
      {label}
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full mt-0.5 bg-[#252525] border border-[#333] rounded px-2 py-1 text-white text-sm outline-none focus:border-[#f0a500]"
      />
    </label>
  );
}
