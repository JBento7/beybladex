"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TARGETS, pipDots, type Field, type FieldDef } from "@/lib/arenaLayout";

type TargetKey = keyof typeof TARGETS;

// Representative content shown per target so positions are easy to judge.
const SAMPLES: Record<string, Record<string, string>> = {
  scoreboard: {
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
  },
  winner: { name: "VENCEDOR", scoreWin: "7", scoreLose: "3" },
};
// Partidas Rápidas shares the scoreboard art, so reuse its sample content.
SAMPLES.quickmatch = SAMPLES.scoreboard;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function r1(v: number) {
  return Math.round(v * 10) / 10;
}
// The counterpart key on the other side (nameL <-> nameR, cxLockL <-> cxLockR…).
function pairKey(key: string): string | null {
  if (/L$/.test(key)) return key.slice(0, -1) + "R";
  if (/R$/.test(key)) return key.slice(0, -1) + "L";
  return null;
}
// Horizontal mirror of a field. Text is center-anchored (x' = 100 - x);
// images/pips are left-anchored (x' = 100 - x - w).
function mirrorField(kind: string, f: Field): Field {
  const x = kind === "text" ? 100 - f.x : 100 - f.x - (f.w ?? 0);
  return { ...f, x: r1(x) };
}

// Custom scoreboard fields the organizer adds (text or integer), positioned in
// the editor and given a live value that drives the placar.
export type CustomField = { key: string; label: string; type: "text" | "int"; value: string } & Field;
const isCustom = (k: string) => k.startsWith("custom_");

export default function LayoutEditor({
  initial,
  profile,
}: {
  initial: Record<string, Record<string, Field>>;
  profile: { name: string; avatar: string | null; deck: (string | null)[] };
}) {
  const [target, setTarget] = useState<TargetKey>("scoreboard");
  const [preview, setPreview] = useState(false);

  // Custom background per target (uploaded), overriding the default art.
  const [bgByTarget, setBgByTarget] = useState<Record<string, string>>({});
  const [bgStatus, setBgStatus] = useState<"" | "uploading" | "saved" | "error">("");
  const bgInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    Object.keys(TARGETS).forEach((t) => {
      fetch(`/api/arena-layout?key=${t}::bg`).then((r) => (r.ok ? r.json() : null)).then((d) => {
        const url = d?.layout?.url;
        if (url) setBgByTarget((prev) => ({ ...prev, [t]: url }));
      }).catch(() => {});
    });
  }, []);
  // quickmatch shares the scoreboard art, so it inherits that custom BG.
  const bgUrl = bgByTarget[target] || (target === "quickmatch" ? bgByTarget["scoreboard"] : "") || TARGETS[target].bg;

  async function onPickBg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBgStatus("uploading");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/admin/beyparts/upload", { method: "POST", body: fd });
      const j = await up.json();
      if (!up.ok || !j.path) { setBgStatus("error"); setTimeout(() => setBgStatus(""), 2500); return; }
      setBgByTarget((prev) => ({ ...prev, [target]: j.path }));
      const res = await fetch("/api/arena-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: `${target}::bg`, layout: { url: j.path } }),
      });
      setBgStatus(res.ok ? "saved" : "error");
    } catch {
      setBgStatus("error");
    }
    setTimeout(() => setBgStatus(""), 2500);
  }
  async function restoreBg() {
    setBgByTarget((prev) => { const n = { ...prev }; delete n[target]; return n; });
    await fetch("/api/arena-layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `${target}::bg`, layout: {} }),
    }).catch(() => {});
  }

  // Sample content for the preview, using the organizer's profile as a base.
  function previewText(k: string): string {
    if (isCustom(k)) return customValue(k);
    if (k === "nameL" || k === "nameR" || k === "name") return profile.name;
    const map: Record<string, string> = {
      scoreL: "3", scoreR: "0", scoreWin: "7", scoreLose: "3",
      beyNameL: "Dranzer", beyNameR: "Dranzer",
      rodada: "01", partida: "03 / 08", status: "AO VIVO",
      evento: "Campeonato SP", fase: "Rodada 1", local: "Londrina/PR", obs: "—",
    };
    return map[k] ?? "";
  }
  function previewImg(k: string): string | null {
    if (k === "photoL" || k === "photoR" || k === "photo") return profile.avatar;
    // Winner deck: use the matching bey from the profile; scoreboard bey: first one.
    const deckIndex = k === "deck1" ? 0 : k === "deck2" ? 1 : k === "deck3" ? 2 : 0;
    return profile.deck?.[deckIndex] || profile.deck?.find(Boolean) || "/bey-removebg-preview.png";
  }
  const PIP_COUNTS: Record<string, number> = { pointsL: 3, pointsR: 1, victoriesL: 2, victoriesR: 1 };

  // Full geometry per target = defaults merged with saved overrides.
  const [byTarget, setByTarget] = useState<Record<string, Record<string, Field>>>(() => {
    const out: Record<string, Record<string, Field>> = {};
    for (const t of Object.keys(TARGETS)) {
      const defs = TARGETS[t].defaults;
      const f: Record<string, Field> = {};
      for (const k of Object.keys(defs)) f[k] = { ...defs[k], ...(initial?.[t as TargetKey]?.[k] || {}) };
      out[t] = f;
    }
    return out;
  });

  // Custom fields (scoreboard only). Meta (label/type/value) lives here;
  // geometry lives in byTarget.scoreboard[key] like every other element.
  const [customs, setCustoms] = useState<Omit<CustomField, keyof Field>[]>([]);
  useEffect(() => {
    fetch("/api/arena-layout?key=scoreboard::custom").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const arr = Array.isArray(d?.layout) ? (d.layout as CustomField[]) : [];
      if (!arr.length) return;
      setCustoms(arr.map((c) => ({ key: c.key, label: c.label, type: c.type, value: c.value })));
      setByTarget((prev) => {
        const sb = { ...prev.scoreboard };
        for (const c of arr) sb[c.key] = { x: c.x, y: c.y, w: c.w, h: c.h, fs: c.fs };
        return { ...prev, scoreboard: sb };
      });
    }).catch(() => {});
  }, []);
  const customDefs = useMemo(() => {
    const out: Record<string, FieldDef> = {};
    for (const c of customs) out[c.key] = { kind: "text", label: c.label, x: 50, y: 50, w: 14, fs: 1.8 };
    return out;
  }, [customs]);
  const customValue = (k: string) => customs.find((c) => c.key === k)?.value ?? "";

  const [sel, setSel] = useState<string | null>(null);
  // Which elements are shown/editable on the board (chosen in the sidebar) so
  // overlapping items don't clutter the view while editing.
  const [editKeys, setEditKeys] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { key: string; mode: "move" | "resize"; startX: number; startY: number; orig: Field }>(null);

  const defs: Record<string, FieldDef> = target === "scoreboard" ? { ...TARGETS[target].defaults, ...customDefs } : TARGETS[target].defaults;
  const KEYS = Object.keys(defs);
  const fields = byTarget[target];
  const SAMPLE = SAMPLES[target] || {};
  // Text shown for an element on the board: custom fields show their value.
  const cellText = (k: string) => (isCustom(k) ? (customValue(k) || defs[k]?.label || "") : (SAMPLE[k] ?? defs[k]?.label ?? ""));

  function pct(clientX: number, clientY: number) {
    const el = boardRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 };
  }
  function setField(key: string, updater: (cur: Field) => Field) {
    setByTarget((prev) => ({ ...prev, [target]: { ...prev[target], [key]: updater(prev[target][key]) } }));
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = drag.current;
      if (!d) return;
      const p = pct(e.clientX, e.clientY);
      const def = defs[d.key];
      setField(d.key, (cur0) => {
        const cur: Field = { ...cur0 };
        if (d.mode === "move") {
          cur.x = clamp(r1(d.orig.x + (p.x - d.startX)), 0, 100);
          cur.y = clamp(r1(d.orig.y + (p.y - d.startY)), 0, 100);
        } else if (!def || def.kind === "text") {
          cur.fs = Math.max(0.4, r1((d.orig.fs ?? 1.5) + (p.y - d.startY) * 0.18));
        } else {
          cur.w = clamp(r1((d.orig.w ?? 10) + (p.x - d.startX)), 1, 100);
          cur.h = clamp(r1((d.orig.h ?? 10) + (p.y - d.startY)), 1, 100);
        }
        return cur;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  function startDrag(e: React.PointerEvent, key: string, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    const p = pct(e.clientX, e.clientY);
    drag.current = { key, mode, startX: p.x, startY: p.y, orig: { ...fields[key] } };
    setSel(key);
  }
  function upd(key: string, patch: Partial<Field>) {
    setField(key, (cur) => ({ ...cur, ...patch }));
  }
  function resetField(key: string) {
    setField(key, () => ({ ...defs[key] }));
  }
  // Toggle an element's visibility/editability from the sidebar.
  function toggleEdit(k: string) {
    setEditKeys((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
    setSel(k);
  }
  function showAll() { setEditKeys(new Set(KEYS)); }
  function hideAll() { setEditKeys(new Set()); setSel(null); }

  // Mirror the SELECTED element (all of it: position, size, font) onto its
  // paired side, flipping x horizontally so the layout is symmetric.
  const selPair = sel ? pairKey(sel) : null;
  const canMirror = !!(sel && selPair && defs[selPair]);
  function mirrorSelected() {
    if (!sel || !selPair || !defs[selPair]) return;
    const src = fields[sel];
    const mirrored: Field = { ...src, ...mirrorField(defs[sel].kind, src) };
    setByTarget((prev) => ({ ...prev, [target]: { ...prev[target], [selPair]: mirrored } }));
    setEditKeys((prev) => new Set(prev).add(selPair));
  }
  // Create a new custom field (scoreboard only).
  function addCustom() {
    const label = window.prompt("Nome do campo (ex.: Mesa, Round, Nº):");
    if (!label || !label.trim()) return;
    const type: "text" | "int" = window.confirm("Este campo é numérico (inteiro)?\n\nOK = Número · Cancelar = Texto") ? "int" : "text";
    const n = customs.reduce((m, c) => Math.max(m, parseInt(c.key.replace("custom_", "")) || 0), 0) + 1;
    const key = `custom_${n}`;
    setCustoms((prev) => [...prev, { key, label: label.trim(), type, value: type === "int" ? "0" : "" }]);
    setByTarget((prev) => ({ ...prev, scoreboard: { ...prev.scoreboard, [key]: { x: 50, y: 50, w: 14, fs: 1.8 } } }));
    setEditKeys((prev) => new Set(prev).add(key));
    setSel(key);
  }
  function updateCustom(key: string, patch: Partial<Pick<CustomField, "label" | "type" | "value">>) {
    setCustoms((prev) => prev.map((c) => {
      if (c.key !== key) return c;
      const next = { ...c, ...patch };
      if (next.type === "int" && "value" in patch) next.value = String(patch.value ?? "").replace(/[^\d-]/g, "");
      return next;
    }));
  }
  function deleteCustom(key: string) {
    setCustoms((prev) => prev.filter((c) => c.key !== key));
    setByTarget((prev) => { const sb = { ...prev.scoreboard }; delete sb[key]; return { ...prev, scoreboard: sb }; });
    setEditKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
    if (sel === key) setSel(null);
  }

  function resetAll() {
    setByTarget((prev) => {
      const f: Record<string, Field> = {};
      for (const k of KEYS) f[k] = { ...defs[k] };
      return { ...prev, [target]: f };
    });
    setSel(null);
  }
  async function save() {
    setStatus("saving");
    try {
      // Standard layout excludes custom keys (those persist separately).
      const std = Object.fromEntries(Object.entries(fields).filter(([k]) => !isCustom(k)));
      const puts: Promise<Response>[] = [
        fetch("/api/arena-layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: target, layout: std }),
        }),
      ];
      // On the scoreboard, also persist the custom fields (meta + geometry).
      if (target === "scoreboard") {
        const arr: CustomField[] = customs.map((c) => ({ ...c, ...(fields[c.key] || { x: 50, y: 50, w: 14, fs: 1.8 }) }));
        puts.push(fetch("/api/arena-layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "scoreboard::custom", layout: arr }),
        }));
      }
      const results = await Promise.all(puts);
      setStatus(results.every((r) => r.ok) ? "saved" : "error");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus(""), 2500);
  }

  const selField = sel ? fields[sel] : null;
  const selDef = sel ? defs[sel] : null;

  return (
    <div>
      {/* Target tabs + preview toggle */}
      <div className="flex gap-2 mb-3 items-center">
        {Object.keys(TARGETS).map((t) => (
          <button
            key={t}
            onClick={() => { setTarget(t as TargetKey); setSel(null); setEditKeys(new Set()); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${target === t ? "bg-[#f0a500] text-black" : "bg-[#1a1a1a] text-gray-300 border border-[#2a2a2a] hover:bg-[#252525]"}`}
          >
            {TARGETS[t].label}
          </button>
        ))}
        <input ref={bgInputRef} type="file" accept="image/*" onChange={onPickBg} className="hidden" />
        <button
          onClick={() => bgInputRef.current?.click()}
          disabled={target === "quickmatch"}
          title={target === "quickmatch" ? "As Partidas Rápidas usam o BG do Placar" : "Trocar imagem de fundo"}
          className={`ml-auto px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${target === "quickmatch" ? "bg-[#1a1a1a] text-gray-600 border border-[#2a2a2a] cursor-not-allowed" : "bg-[#1a1a1a] text-gray-300 border border-[#2a2a2a] hover:bg-[#252525]"}`}
        >
          {bgStatus === "uploading" ? "Enviando…" : bgStatus === "saved" ? "BG salvo ✓" : bgStatus === "error" ? "Erro no BG" : "🖼 Trocar BG"}
        </button>
        {bgByTarget[target] && target !== "quickmatch" && (
          <button onClick={restoreBg} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a] hover:bg-[#252525]">
            Restaurar BG
          </button>
        )}
        {!preview && target === "scoreboard" && (
          <button
            onClick={addCustom}
            title="Adicionar um campo de texto ou número ao placar"
            className="px-4 py-1.5 rounded-lg text-sm font-bold transition-colors bg-[#1a1a1a] text-gray-300 border border-[#2a2a2a] hover:bg-[#252525]"
          >
            ➕ Inserir campo
          </button>
        )}
        {!preview && (
          <button
            onClick={mirrorSelected}
            disabled={!canMirror}
            title={canMirror ? "Copiar posição/tamanho do item selecionado para o lado oposto" : "Selecione um item com par (esq/dir)"}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${canMirror ? "bg-[#f0a500] text-black hover:bg-[#d9940a]" : "bg-[#1a1a1a] text-gray-600 border border-[#2a2a2a] cursor-not-allowed"}`}
          >
            ⇄ Espelhar p/ outro lado
          </button>
        )}
        <button
          onClick={() => { setPreview((p) => !p); setSel(null); }}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${preview ? "bg-[#22c55e] text-black" : "bg-[#1a1a1a] text-gray-300 border border-[#2a2a2a] hover:bg-[#252525]"}`}
        >
          {preview ? "✏️ Editar" : "👁 Pré-visualizar"}
        </button>
      </div>

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
              backgroundImage: `url(${bgUrl})`,
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
              const def = defs[k];
              // In edit mode only render the elements ticked in the sidebar.
              if (!preview && !editKeys.has(k)) return null;
              const isSel = sel === k;
              const outline = isSel ? "2px solid #f0a500" : "1px dashed rgba(255,255,255,0.35)";

              // ---- Preview mode: render representative content, no boxes/handles ----
              if (preview) {
                if (def.kind === "text") {
                  return (
                    <div key={k} style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, transform: "translate(-50%, -50%)", width: `${f.w ?? 12}%`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: `${f.fs ?? 1.5}cqw`, fontWeight: 900, color: k === "status" || k === "scoreWin" ? "#ffd400" : "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {previewText(k)}
                    </div>
                  );
                }
                if (def.kind === "pipsV" || def.kind === "pipsH") {
                  const count = PIP_COUNTS[k] ?? 0;
                  return (
                    <div key={k} style={{ position: "absolute", inset: 0 }}>
                      {pipDots(f, def.kind === "pipsV" ? "v" : "h").map((d, i) => (
                        <span key={i} style={{ position: "absolute", left: `${d.cx}%`, top: `${d.cy}%`, transform: "translate(-50%, -50%)", width: `${f.fs ?? 1.5}cqw`, height: `${f.fs ?? 1.5}cqw`, borderRadius: "50%", background: i < count ? "#ffd400" : "transparent" }} />
                      ))}
                    </div>
                  );
                }
                if (k === "finishes") {
                  return (
                    <div key={k} style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5cqw", overflow: "hidden" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6cqw" }}><span style={{ fontSize: "1cqw", fontWeight: 900, color: "#ffd400" }}>SET 1</span><img src="/finishes/spin.png" alt="" style={{ height: "2.6cqw" }} /><img src="/finishes/burst.png" alt="" style={{ height: "2.6cqw" }} /></div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6cqw" }}><span style={{ fontSize: "1cqw", fontWeight: 900, color: "#ffd400" }}>SET 2</span><img src="/finishes/xtreme.png" alt="" style={{ height: "2.6cqw" }} /></div>
                    </div>
                  );
                }
                // img (photo / bey / deck)
                const src = previewImg(k);
                if (!src) return null;
                const cover = k.startsWith("photo");
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={k} src={src} alt="" style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%`, objectFit: cover ? "cover" : "contain", borderRadius: cover ? "1cqw" : undefined }} />
                );
              }
              // ---- Edit mode ----
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
                    {cellText(k)}
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
              {isCustom(sel!) && (
                <div className="space-y-2 border-t border-[#2a2a2a] pt-2 mt-1">
                  <label className="text-[11px] text-gray-400 block">Nome do campo
                    <input value={customs.find((c) => c.key === sel)?.label ?? ""} onChange={(e) => updateCustom(sel!, { label: e.target.value })}
                      className="w-full mt-0.5 bg-[#252525] border border-[#333] rounded px-2 py-1 text-white text-sm outline-none focus:border-[#f0a500]" />
                  </label>
                  <label className="text-[11px] text-gray-400 block">Tipo
                    <select value={customs.find((c) => c.key === sel)?.type ?? "text"} onChange={(e) => updateCustom(sel!, { type: e.target.value as "text" | "int" })}
                      className="w-full mt-0.5 bg-[#252525] border border-[#333] rounded px-2 py-1 text-white text-sm outline-none focus:border-[#f0a500]">
                      <option value="text">Texto</option>
                      <option value="int">Número (inteiro)</option>
                    </select>
                  </label>
                  <label className="text-[11px] text-gray-400 block">Valor
                    <input
                      value={customs.find((c) => c.key === sel)?.value ?? ""}
                      inputMode={customs.find((c) => c.key === sel)?.type === "int" ? "numeric" : "text"}
                      onChange={(e) => updateCustom(sel!, { value: e.target.value })}
                      className="w-full mt-0.5 bg-[#252525] border border-[#333] rounded px-2 py-1 text-white text-sm outline-none focus:border-[#f0a500]" />
                  </label>
                  <button onClick={() => deleteCustom(sel!)} className="text-xs text-red-400 hover:text-red-300 underline">excluir campo</button>
                </div>
              )}
              <button onClick={() => resetField(sel!)} className="text-xs text-gray-400 hover:text-white underline">
                resetar este item
              </button>
            </div>
          ) : (
            <div className="text-xs text-gray-500">Marque abaixo os elementos que quer editar — só eles aparecem no quadro (evita sobreposição). Arraste para mover; a alça amarela dimensiona. Selecione um item e clique ⇄ Espelhar p/ outro lado para copiar posição e tamanho para o lado oposto (simetria).</div>
          )}

          <div className="mt-4 border-t border-[#2a2a2a] pt-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] text-gray-500">Elementos (marque p/ editar)</div>
              <div className="flex gap-1">
                <button onClick={showAll} className="text-[10px] text-gray-400 hover:text-white border border-[#333] rounded px-1.5 py-0.5">Todos</button>
                <button onClick={hideAll} className="text-[10px] text-gray-400 hover:text-white border border-[#333] rounded px-1.5 py-0.5">Nenhum</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {KEYS.map((k) => {
                const on = editKeys.has(k);
                return (
                  <button
                    key={k}
                    onClick={() => toggleEdit(k)}
                    className={`text-[11px] text-left px-2 py-1 rounded flex items-center gap-1 ${sel === k ? "bg-[#f0a500] text-black font-bold" : on ? "bg-[#2a2a2a] text-white" : "text-gray-400 hover:bg-[#252525]"}`}
                  >
                    <span className="w-3 shrink-0">{on ? "☑" : "☐"}</span>
                    <span className="truncate">{defs[k].label}</span>
                  </button>
                );
              })}
            </div>
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
