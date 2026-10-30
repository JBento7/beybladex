"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TARGETS, pipDots, fontStack } from "@/lib/arenaLayout";
import {
  GROUP_LABEL, SCREEN_LABEL, centered, diffCompositions, emptyHistory, fontsUsed, groupOf, isCustomKey, mirrorField,
  pairKey, record, redo as redoH, resizeKeepRatio, restoreDefaults, sameComposition, snapMove, undo as undoH,
  type Composition, type CustomMeta, type Defs, type Field, type FieldDefLike, type FontDef, type History, type LayerGroup, type Screen,
} from "@/lib/layoutDoc";
import FontLoader from "@/components/FontLoader";
import { HiddenCtx, Scoreboard, WinnerScreen, type CustomFld } from "@/components/arena/Boards";
import { BASE_SAMPLE, SCENARIOS, buildPreview, type Sample } from "./previewScenarios";

// Layout editor (docs/EDITOR-LAYOUT.md). Flow: Editar → Pré-visualizar →
// Aplicar no telão. Every screen has its own draft (saved on this device),
// its own undo/redo history and a base version; only "Aplicar no telão"
// (one validated, versioned transaction on the server) changes what the
// arenas show. Coordinates are % of the 1672×941 board whatever the zoom.

type Published = { version: number; composition: Composition; publishedAt: string | null; publishedBy: string | null };
type Doc = { base: Published; draft: Composition; history: History<Composition> };
const SCREENS: Screen[] = ["scoreboard", "winner", "quickmatch"];
const DRAFT_KEY = (s: Screen) => `lbl:layout:rascunho:${s}`;
const LIB_KEY = "lbl:layout:rascunho:fontes";
const btn = "min-h-[44px] px-3 rounded-lg text-sm font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnGhost = `${btn} bg-card text-gray-200 border-line hover:bg-field`;
const btnOn = `${btn} bg-brand-yellow text-black border-brand-yellow`;
const r2 = (v: number) => Math.round(v * 100) / 100;
const ls = () => { try { return window.localStorage; } catch { return null; } };
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export default function LayoutEditor({
  published,
  library: libraryInitial,
  profile,
}: {
  published: Record<Screen, Published>;
  library: FontDef[];
  profile: { name: string; avatar: string | null; deck: (string | null)[] };
}) {
  // ── Documents (one per screen) ──
  const [docs, setDocs] = useState<Record<Screen, Doc>>(() => {
    const out = {} as Record<Screen, Doc>;
    for (const s of SCREENS) out[s] = { base: published[s], draft: published[s].composition, history: emptyHistory() };
    return out;
  });
  const [screen, setScreen] = useState<Screen>("scoreboard");
  const doc = docs[screen];
  const draft = doc.draft;
  const baseDefs = TARGETS[screen].defaults as Defs;
  // Custom fields are elements too (scoreboard).
  const defs: Defs = useMemo(() => {
    const out: Defs = { ...baseDefs };
    for (const c of draft.customs) out[c.key] = { kind: "text", label: c.label, x: 50, y: 50, w: 14, fs: 1.8 };
    return out;
  }, [baseDefs, draft.customs]);
  const keys = Object.keys(defs);
  const dirtyOf = (s: Screen) => !sameComposition(docs[s].draft, docs[s].base.composition);
  const dirty = dirtyOf(screen);

  // Font library available in the editor (server library + fonts added here).
  const [library, setLibrary] = useState<FontDef[]>(libraryInitial);
  const [fontsRemoved, setFontsRemoved] = useState<string[]>([]);

  // ── Edits & history ──
  const setDraft = useCallback((s: Screen, next: Composition) => setDocs((d) => ({ ...d, [s]: { ...d[s], draft: next } })), []);
  /** One undoable operation. */
  const commit = useCallback((mut: (c: Composition) => Composition, s: Screen = screen) => {
    setDocs((d) => {
      const cur = d[s].draft;
      const next = mut(cur);
      if (next === cur || JSON.stringify(next) === JSON.stringify(cur)) return d;
      return { ...d, [s]: { ...d[s], draft: next, history: record(d[s].history, cur) } };
    });
  }, [screen]);
  // A gesture (drag, resize, slider) = ONE operation: the state at its start
  // becomes the undo step when it ends.
  const gestureRef = useRef<{ screen: Screen; before: Composition } | null>(null);
  const beginGesture = () => { if (!gestureRef.current) gestureRef.current = { screen, before: docs[screen].draft }; };
  const endGesture = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    setDocs((d) => (JSON.stringify(d[g.screen].draft) === JSON.stringify(g.before) ? d : { ...d, [g.screen]: { ...d[g.screen], history: record(d[g.screen].history, g.before) } }));
  };
  const live = (mut: (c: Composition) => Composition) => setDocs((d) => ({ ...d, [screen]: { ...d[screen], draft: mut(d[screen].draft) } }));
  const doUndo = useCallback(() => setDocs((d) => {
    const r = undoH(d[screen].history, d[screen].draft);
    return r ? { ...d, [screen]: { ...d[screen], draft: r.value, history: r.h } } : d;
  }), [screen]);
  const doRedo = useCallback(() => setDocs((d) => {
    const r = redoH(d[screen].history, d[screen].draft);
    return r ? { ...d, [screen]: { ...d[screen], draft: r.value, history: r.h } } : d;
  }), [screen]);

  const setField = (k: string, patch: Partial<Field>) => commit((c) => ({ ...c, fields: { ...c.fields, [k]: { ...c.fields[k], ...patch } } }));
  const liveField = (k: string, patch: Partial<Field>) => live((c) => ({ ...c, fields: { ...c.fields, [k]: { ...c.fields[k], ...patch } } }));
  const toggleIn = (list: "hidden" | "locked" | "keepRatio", k: string) => commit((c) => ({ ...c, [list]: c[list].includes(k) ? c[list].filter((x) => x !== k) : [...c[list], k] }));

  // ── Drafts on this device ──
  const [recoverable, setRecoverable] = useState<Partial<Record<Screen, { savedAt: number; baseVersion: number }>>>({});
  useEffect(() => {
    const st = ls();
    if (!st) return;
    const found: Partial<Record<Screen, { savedAt: number; baseVersion: number }>> = {};
    for (const s of SCREENS) {
      try {
        const raw = st.getItem(DRAFT_KEY(s));
        if (!raw) continue;
        const d = JSON.parse(raw);
        if (d?.draft && !sameComposition(d.draft, published[s].composition)) found[s] = { savedAt: d.savedAt, baseVersion: d.baseVersion };
        else st.removeItem(DRAFT_KEY(s));
      } catch { st.removeItem(DRAFT_KEY(s)); }
    }
    setRecoverable(found);
  }, [published]);
  // Auto-save (debounced) every dirty screen; clean screens drop their draft.
  const recoverPending = useRef(recoverable);
  recoverPending.current = recoverable;
  useEffect(() => {
    const t = setTimeout(() => {
      const st = ls();
      if (!st) return;
      for (const s of SCREENS) {
        if (recoverPending.current[s]) continue; // don't overwrite an unanswered saved draft
        if (dirtyOf(s)) st.setItem(DRAFT_KEY(s), JSON.stringify({ baseVersion: docs[s].base.version, draft: docs[s].draft, savedAt: Date.now() }));
        else st.removeItem(DRAFT_KEY(s));
      }
      try { st.setItem(LIB_KEY, JSON.stringify({ library, fontsRemoved })); } catch { /* quota */ }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, library, fontsRemoved]);
  function recoverDraft(s: Screen) {
    try {
      const d = JSON.parse(ls()?.getItem(DRAFT_KEY(s)) ?? "null");
      const lib = JSON.parse(ls()?.getItem(LIB_KEY) ?? "null");
      if (lib?.library) setLibrary((cur) => [...cur, ...(lib.library as FontDef[]).filter((f) => !cur.some((x) => x.family === f.family))]);
      if (d?.draft) {
        setDocs((all) => ({ ...all, [s]: { ...all[s], draft: d.draft, history: record(all[s].history, all[s].draft) } }));
        if (d.baseVersion !== docs[s].base.version) setMsg({ tone: "warn", text: `Rascunho recuperado. Ele foi feito sobre a versão ${d.baseVersion}; a publicada agora é a ${docs[s].base.version}. Revise antes de aplicar.` });
      }
    } catch { /* ignore */ }
    setRecoverable((r) => { const n = { ...r }; delete n[s]; return n; });
    setScreen(s);
  }
  function discardDraft(s: Screen) {
    if (!window.confirm(`Descartar o rascunho de ${SCREEN_LABEL[s]}? A versão publicada continua no telão.`)) return;
    ls()?.removeItem(DRAFT_KEY(s));
    setRecoverable((r) => { const n = { ...r }; delete n[s]; return n; });
    setDocs((all) => ({ ...all, [s]: { ...all[s], draft: all[s].base.composition, history: record(all[s].history, all[s].draft) } }));
  }
  // Leaving with unapplied changes: the browser asks first.
  useEffect(() => {
    if (!SCREENS.some(dirtyOf)) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);

  // ── View: what the board shows ──
  type View = { kind: "draft" } | { kind: "published" } | { kind: "default" } | { kind: "version"; version: number; composition: Composition };
  const [view, setView] = useState<View>({ kind: "draft" });
  const [preview, setPreview] = useState(false);
  const shown: Composition = useMemo(() => {
    if (view.kind === "published") return doc.base.composition;
    if (view.kind === "version") return view.composition;
    if (view.kind === "default") return restoreDefaults({ ...draft, hidden: [], customs: screen === "scoreboard" ? draft.customs : [] }, baseDefs);
    return draft;
  }, [view, doc.base.composition, draft, baseDefs, screen]);
  const editing = view.kind === "draft" && !preview;

  // ── Selection, layers ──
  const [sel, setSel] = useState<string | null>(null);
  const [isolate, setIsolate] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => { setSel(null); setView({ kind: "draft" }); }, [screen]);
  const selDef: FieldDefLike | null = sel ? defs[sel] ?? null : null;
  const selField: Field | null = sel ? draft.fields[sel] ?? null : null;
  const locked = (k: string) => draft.locked.includes(k);
  const hiddenEditable = screen !== "quickmatch"; // Partida rápida follows the Placar's visibility

  // ── Board interactions ──
  const boardRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState(false);
  const [snap, setSnap] = useState(true);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const drag = useRef<null | { key: string; mode: "move" | "resize"; start: { x: number; y: number }; orig: Field }>(null);
  const pct = (cx: number, cy: number) => {
    const r = boardRef.current?.getBoundingClientRect();
    return r ? { x: ((cx - r.left) / r.width) * 100, y: ((cy - r.top) / r.height) * 100 } : { x: 0, y: 0 };
  };
  const snapTargets = (except: string) => {
    const xs = [50], ys = [50];
    if (grid) for (let v = 0; v <= 100; v += 5) { xs.push(v); ys.push(v); }
    for (const k of keys) {
      if (k === except || !draft.fields[k]) continue;
      const f = draft.fields[k], kind = defs[k].kind;
      if (kind === "text") { xs.push(f.x); ys.push(f.y); }
      else { xs.push(f.x, f.x + (f.w ?? 0) / 2, f.x + (f.w ?? 0)); ys.push(f.y, f.y + (f.h ?? 0) / 2, f.y + (f.h ?? 0)); }
    }
    return { x: xs, y: ys };
  };
  function startDrag(e: React.PointerEvent, key: string, mode: "move" | "resize") {
    e.stopPropagation();
    setSel(key);
    if (!editing || locked(key)) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    beginGesture();
    drag.current = { key, mode, start: pct(e.clientX, e.clientY), orig: { ...draft.fields[key] } };
  }
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = drag.current;
      if (!d) return;
      const p = pct(e.clientX, e.clientY);
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      const def = defs[d.key];
      if (d.mode === "move") {
        let f: Field = { ...d.orig, x: r2(d.orig.x + dx), y: r2(d.orig.y + dy) };
        if (snap) {
          const s = snapMove(def.kind, f, snapTargets(d.key));
          f = { ...f, x: s.x, y: s.y };
          setGuides(s.guides);
        }
        liveField(d.key, { x: f.x, y: f.y });
      } else if (def.kind === "text") {
        liveField(d.key, { fs: Math.max(0.2, r2((d.orig.fs ?? 1.5) + dy * 0.18)) });
      } else if (def.kind === "img" && draft.keepRatio.includes(d.key)) {
        liveField(d.key, resizeKeepRatio(d.orig, (d.orig.w ?? 10) + dx));
      } else {
        liveField(d.key, { w: Math.max(0.5, r2((d.orig.w ?? 10) + dx)), h: Math.max(0.5, r2((d.orig.h ?? 10) + dy)) });
      }
    }
    function onUp() {
      if (!drag.current) return;
      drag.current = null;
      setGuides({ x: null, y: null });
      endGesture();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp); };
  });

  // Keyboard: undo/redo (never while typing) and nudging the selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
      if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); doRedo(); return; }
      if (!sel || !editing || locked(sel) || !draft.fields[sel]) return;
      const step = e.shiftKey ? 1 : 0.1;
      const d = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : e.key === "ArrowDown" ? [0, step] : null;
      if (!d) return;
      e.preventDefault();
      const f = draft.fields[sel];
      setField(sel, { x: r2(f.x + d[0]), y: r2(f.y + d[1]) });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Zoom, fullscreen, panels ──
  const [zoom, setZoom] = useState(100);
  const [propsOpen, setPropsOpen] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else wrapRef.current?.requestFullscreen?.().catch(() => {}); };

  // ── Preview data ──
  const [sample, setSample] = useState<Sample>({ ...BASE_SAMPLE, name1: profile.name });
  const [scenario, setScenario] = useState("");
  const pv = useMemo(() => buildPreview(sample, profile), [sample, profile]);

  // ── Background (draft only: applied with the layout) ──
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [bgBusy, setBgBusy] = useState(false);
  async function onPickBg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBgBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/admin/beyparts/upload", { method: "POST", body: fd });
      const j = await up.json().catch(() => ({}));
      if (!up.ok || !j.path) setMsg({ tone: "error", text: j.error || "Não foi possível enviar a imagem." });
      // Stored in the draft only: the telão keeps its background until applied.
      else commit((c) => ({ ...c, bg: j.path }));
    } catch { setMsg({ tone: "error", text: "Falha de conexão ao enviar a imagem." }); }
    setBgBusy(false);
  }
  const bgOf = (c: Composition) => c.bg || (screen === "quickmatch" ? docs.scoreboard.base.composition.bg : null) || TARGETS[screen].bg;

  // ── Fonts (library changes travel with the next publication) ──
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [showFonts, setShowFonts] = useState(false);
  function onPickFont(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const family = window.prompt("Nome para esta fonte (ex.: Minha Fonte):", file.name.replace(/\.[^.]+$/, ""))?.trim();
    if (!family) return;
    if (library.some((f) => f.family === family)) { setMsg({ tone: "warn", text: `Já existe uma fonte "${family}". Use outro nome — fontes publicadas não são substituídas.` }); return; }
    const reader = new FileReader();
    reader.onload = () => setLibrary((l) => [...l, { family, kind: "upload", src: String(reader.result) }]);
    reader.readAsDataURL(file);
  }
  function addGoogleFont() {
    const raw = window.prompt("Nome da fonte no Google Fonts (ex.: Oswald, Bebas Neue). Pode colar o link também.")?.trim();
    if (!raw) return;
    const m = raw.match(/[?&]family=([^&:]+)/i);
    const family = (m ? decodeURIComponent(m[1]).replace(/\+/g, " ") : raw).trim();
    if (!family || library.some((f) => f.family === family)) return;
    setLibrary((l) => [...l, { family, kind: "google" }]);
  }
  function removeFont(family: string) {
    const users = SCREENS.filter((s) => Object.values(docs[s].base.composition.fields).some((f) => f.ff === family)).map((s) => SCREEN_LABEL[s]);
    if (!window.confirm(users.length
      ? `A fonte "${family}" é usada pela(s) tela(s) publicada(s): ${users.join(", ")}. Ela sai da lista deste editor, mas continua no telão enquanto alguma tela publicada a usar. Continuar?`
      : `Remover "${family}" da biblioteca? Os elementos deste rascunho que a usam voltam ao tipo de letra padrão.`)) return;
    setLibrary((l) => l.filter((f) => f.family !== family));
    setFontsRemoved((r) => [...new Set([...r, family])]);
    commit((c) => ({ ...c, fields: Object.fromEntries(Object.entries(c.fields).map(([k, f]) => [k, f.ff === family ? { ...f, ff: undefined } : f])) }));
  }

  // ── Custom fields (scoreboard) ──
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<"text" | "int">("text");
  function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    const n = draft.customs.reduce((m, c) => Math.max(m, parseInt(c.key.replace("custom_", "")) || 0), 0) + 1;
    const key = `custom_${n}`;
    commit((c) => ({ ...c, customs: [...c.customs, { key, label: label.slice(0, 40), type: newType, value: newType === "int" ? "0" : "" }], fields: { ...c.fields, [key]: { x: 50, y: 50, w: 14, fs: 1.8 } } }));
    setNewLabel("");
    setSel(key);
  }
  const customOf = (k: string) => draft.customs.find((c) => c.key === k);
  const setCustom = (k: string, patch: Partial<CustomMeta>) => commit((c) => ({ ...c, customs: c.customs.map((x) => (x.key === k ? { ...x, ...patch } : x)) }));
  function deleteCustom(k: string) {
    if (!window.confirm(`Excluir o campo "${customOf(k)?.label}" do rascunho? Dá para desfazer.`)) return;
    commit((c) => {
      const fields = { ...c.fields };
      delete fields[k];
      return { ...c, customs: c.customs.filter((x) => x.key !== k), fields, hidden: c.hidden.filter((x) => x !== k), locked: c.locked.filter((x) => x !== k) };
    });
    setSel(null);
  }

  // ── Restore defaults ──
  const [confirmRestore, setConfirmRestore] = useState(false);
  const restoreElement = (k: string) => {
    const def = baseDefs[k];
    if (!def) return;
    const { kind: _k, label: _l, ...g } = def;
    commit((c) => ({ ...c, fields: { ...c.fields, [k]: { ...(g as Field) } } }));
  };

  // ── Messages / publication / versions / conflict ──
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const publishingRef = useRef(false);
  const [conflict, setConflict] = useState<{ version: number; publishedAt: string | null; publishedBy: string | null; diff?: string[] } | null>(null);
  async function publish() {
    if (publishingRef.current) return; // no duplicate submissions
    publishingRef.current = true;
    setPublishing(true);
    setMsg(null);
    const s = screen;
    const composition: Composition = { ...docs[s].draft, fonts: fontsUsed(docs[s].draft.fields, library) };
    try {
      const res = await fetch("/api/arena-layout/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screen: s, baseVersion: docs[s].base.version, composition, fontsRemoved }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        setDocs((all) => ({ ...all, [s]: { ...all[s], base: { version: d.version, composition, publishedAt: new Date().toISOString(), publishedBy: "você" } } }));
        ls()?.removeItem(DRAFT_KEY(s));
        setFontsRemoved([]);
        setConflict(null);
        setMsg({ tone: "ok", text: `${SCREEN_LABEL[s]} aplicado no telão: versão ${d.version}.${(d.warnings ?? []).length ? " " + d.warnings.join(" ") : ""} As arenas carregam a nova versão na próxima atualização — veja as confirmações abaixo.` });
      } else if (res.status === 409 && d.conflict) {
        setConflict(d.conflict);
        setMsg({ tone: "warn", text: `${d.error} Seu rascunho foi preservado.` });
      } else {
        setMsg({ tone: "error", text: `${d.error || "Não foi possível aplicar."}${d.errors?.length ? " " + d.errors.slice(0, 4).join(" ") : ""} Nada foi alterado no telão; o rascunho foi preservado.` });
      }
    } catch {
      setMsg({ tone: "error", text: "Falha de conexão. Nada foi alterado no telão; o rascunho foi preservado. Tente novamente." });
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }
  async function loadCurrent(mode: "diff" | "load" | "rebase") {
    const res = await fetch(`/api/arena-layout/versions?screen=${screen}&current=1`, { cache: "no-store" });
    if (!res.ok) { setMsg({ tone: "error", text: "Não foi possível carregar a versão atual." }); return; }
    const cur: Published = await res.json();
    const d = diffCompositions(cur.composition, draft);
    const names = [...d.changed.map((k) => defs[k]?.label ?? k), ...d.meta];
    if (mode === "diff") setConflict((c) => (c ? { ...c, diff: names } : c));
    if (mode === "load") {
      setDocs((all) => ({ ...all, [screen]: { ...all[screen], base: cur, draft: cur.composition, history: record(all[screen].history, all[screen].draft) } }));
      setConflict(null);
      setMsg({ tone: "ok", text: `Versão ${cur.version} carregada no rascunho (dá para desfazer e voltar ao seu rascunho).` });
    }
    if (mode === "rebase") {
      setDocs((all) => ({ ...all, [screen]: { ...all[screen], base: cur } }));
      setConflict(null);
      setMsg({ tone: "warn", text: `Base atualizada para a versão ${cur.version}. Diferenças do seu rascunho: ${names.join(", ") || "nenhuma"}. Revise e clique em Aplicar no telão.` });
    }
  }
  const [versions, setVersions] = useState<{ id: string; version: number; publishedAt: string; publishedBy: string }[] | null>(null);
  const [cmp, setCmp] = useState<{ version: number; names: string[] } | null>(null);
  async function openVersions() {
    setVersions([]);
    const res = await fetch(`/api/arena-layout/versions?screen=${screen}`, { cache: "no-store" });
    setVersions(res.ok ? (await res.json()).versions : []);
  }
  async function versionComp(id: string) {
    const res = await fetch(`/api/arena-layout/versions?screen=${screen}&id=${id}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as { version: number; composition: Composition }) : null;
  }
  useEffect(() => { setVersions(null); setCmp(null); setConflict(null); }, [screen]);

  // ── Telão confirmations ──
  const [acks, setAcks] = useState<{ deviceId: string; arena: string; community: string; versions: Partial<Record<Screen, number>>; at: number }[] | null>(null);
  const loadAcks = useCallback(async () => {
    const res = await fetch("/api/arena-layout/ack", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setAcks((await res.json()).acks);
  }, []);
  useEffect(() => { loadAcks(); const t = setInterval(loadAcks, 20000); return () => clearInterval(t); }, [loadAcks]);

  // ── Layers ──
  const groupMap = new Map<LayerGroup, string[]>();
  for (const k of keys) {
    if (search && !defs[k].label.toLowerCase().includes(search.toLowerCase())) continue;
    const g = groupOf(screen, k);
    groupMap.set(g, [...(groupMap.get(g) ?? []), k]);
  }
  const groups = [...groupMap.entries()];
  const lockGroup = (ks: string[], lock: boolean) => commit((c) => ({ ...c, locked: lock ? [...new Set([...c.locked, ...ks])] : c.locked.filter((k) => !ks.includes(k)) }));

  const sampleText = (k: string): string => {
    if (isCustomKey(k)) return customOf(k)?.value || defs[k]?.label || "";
    const map: Record<string, string> = {
      nameL: sample.name1, nameR: sample.name2, name: sample.name1, scoreL: String(sample.score1), scoreR: String(sample.score2),
      scoreWin: String(sample.score1), scoreLose: String(sample.score2), beyNameL: sample.bey1, beyNameR: sample.bey2,
      rodada: "01", partida: "03 / 08", status: "AO VIVO", evento: sample.event, fase: sample.phase, local: "Londrina/PR", obs: "ARENA 1 · SET 1 DE ATÉ 3",
    };
    return map[k] ?? defs[k]?.label ?? "";
  };

  // Shared renderer data for the preview (same code as the telão).
  const sbComp = screen === "quickmatch" ? docs.scoreboard.draft : shown;
  const previewCustoms: CustomFld[] = sbComp.customs.map((c) => ({ ...c, ...(sbComp.fields[c.key] ?? { x: 50, y: 50 }) }) as CustomFld);
  const previewFonts = [...library, ...shown.fonts.filter((f) => !library.some((l) => l.family === f.family))];

  const canUndo = doc.history.past.length > 0, canRedo = doc.history.future.length > 0;
  const pair = sel ? pairKey(sel) : null;
  const hasPair = !!(pair && defs[pair]);

  // ── Render ──
  return (
    <div ref={wrapRef} className={fs ? "bg-app p-3 overflow-auto h-screen" : ""}>
      <FontLoader fonts={previewFonts} />

      {/* Saved drafts from an earlier session */}
      {Object.entries(recoverable).map(([s, r]) => (
        <div key={s} role="alert" className="mb-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-100 flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[12rem]">Há um rascunho de <b>{SCREEN_LABEL[s as Screen]}</b> salvo neste aparelho em {fmtDate(new Date(r!.savedAt).toISOString())} (feito sobre a versão {r!.baseVersion}).</span>
          <button className={btnOn} onClick={() => recoverDraft(s as Screen)}>Recuperar rascunho</button>
          <button className={btnGhost} onClick={() => discardDraft(s as Screen)}>Descartar rascunho</button>
        </div>
      ))}

      {/* Screen tabs */}
      <div className="flex flex-wrap gap-2 mb-2" role="tablist" aria-label="Tela">
        {SCREENS.map((s) => (
          <button key={s} role="tab" aria-selected={screen === s} onClick={() => setScreen(s)} className={screen === s ? btnOn : btnGhost}>
            {SCREEN_LABEL[s]}{dirtyOf(s) && <span className="ml-1.5 text-xs" aria-label="alterações não aplicadas">●</span>}
          </button>
        ))}
      </div>

      {/* Versions bar: default / published / draft */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-card px-3 py-2 text-sm">
        <span className="text-gray-300">Tela: <b className="text-white">{SCREEN_LABEL[screen]}</b></span>
        <span className="text-gray-300">Publicado: <b className="text-white">{doc.base.version === 0 ? "versão inicial (antes do histórico)" : `versão ${doc.base.version}`}</b>{doc.base.publishedAt ? ` · ${fmtDate(doc.base.publishedAt)}${doc.base.publishedBy ? ` · ${doc.base.publishedBy}` : ""}` : ""}</span>
        <span className={dirty ? "text-amber-200 font-bold" : "text-green-300"}>{dirty ? "● Alterações não aplicadas" : "✓ Rascunho igual ao publicado"}</span>
        <label className="flex items-center gap-1 text-gray-300">Mostrar
          <select value={view.kind === "version" ? "version" : view.kind} onChange={(e) => setView({ kind: e.target.value as "draft" | "published" | "default" })} className="min-h-[36px] bg-field border border-line rounded px-2 text-white">
            <option value="draft">Rascunho atual</option>
            <option value="published">Última versão publicada</option>
            <option value="default">Layout padrão</option>
            {view.kind === "version" && <option value="version">Versão {view.version}</option>}
          </select>
        </label>
        {dirty && <button className={btnGhost} onClick={() => discardDraft(screen)}>Descartar rascunho</button>}
      </div>
      {screen === "quickmatch" && (
        <p className="mb-2 text-xs text-gray-400">Partida rápida usa o <b className="text-gray-200">fundo</b> (quando não tem um próprio), os <b className="text-gray-200">campos personalizados</b> e a <b className="text-gray-200">visibilidade</b> do Placar publicado. Aqui você ajusta só posições, tamanhos e tipos de letra.</p>
      )}

      {/* Toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button className={btnGhost} onClick={doUndo} disabled={!canUndo} title="Ctrl+Z / ⌘Z">↶ Desfazer</button>
        <button className={btnGhost} onClick={doRedo} disabled={!canRedo} title="Ctrl+Shift+Z / ⌘⇧Z">↷ Refazer</button>
        <button className={preview ? btnOn : btnGhost} onClick={() => { setPreview((p) => !p); setSel(null); }} aria-pressed={preview}>{preview ? "✏️ Editar" : "👁 Pré-visualizar"}</button>
        <label className="flex items-center gap-1 text-sm text-gray-300">Zoom
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="min-h-[44px] bg-field border border-line rounded px-2 text-white">
            {[50, 100, 150, 200].map((z) => <option key={z} value={z}>{z}%</option>)}
          </select>
        </label>
        <button className={btnGhost} onClick={() => setZoom(100)}>Ajustar à tela</button>
        <button className={grid ? btnOn : btnGhost} onClick={() => setGrid((g) => !g)} aria-pressed={grid}># Grade</button>
        <button className={snap ? btnOn : btnGhost} onClick={() => setSnap((v) => !v)} aria-pressed={snap}>🧲 Encaixe</button>
        <button className={btnGhost} onClick={toggleFs}>{fs ? "Sair da tela cheia" : "⛶ Tela cheia"}</button>
        <button className={btnGhost} onClick={() => setPropsOpen((v) => !v)} aria-expanded={propsOpen}>{propsOpen ? "Ocultar painel" : "Mostrar painel"}</button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input ref={bgInputRef} type="file" accept="image/*" onChange={onPickBg} className="hidden" />
        <button className={btnGhost} onClick={() => bgInputRef.current?.click()} disabled={screen === "quickmatch" || bgBusy || !editing}>{bgBusy ? "Enviando…" : "🖼 Trocar fundo"}</button>
        {draft.bg && screen !== "quickmatch" && <button className={btnGhost} onClick={() => commit((c) => ({ ...c, bg: null }))} disabled={!editing}>Fundo padrão</button>}
        <button className={showFonts ? btnOn : btnGhost} onClick={() => setShowFonts((v) => !v)}>🔤 Fontes</button>
        {screen === "quickmatch" && (
          <button className={btnGhost} disabled={!editing} onClick={() => {
            if (!window.confirm("Copiar posições e tamanhos do rascunho do Placar para a Partida rápida? Dá para desfazer.")) return;
            commit((c) => ({ ...c, fields: Object.fromEntries(Object.keys(baseDefs).map((k) => [k, { ...(docs.scoreboard.draft.fields[k] ?? c.fields[k]) }])) }));
          }}>⧉ Replicar do Placar</button>
        )}
        <button className={btnGhost} onClick={() => setConfirmRestore(true)} disabled={!editing}>Restaurar padrão desta tela</button>
        <button className={btnGhost} onClick={openVersions}>🕘 Versões</button>
        <button
          onClick={publish}
          disabled={publishing || !dirty}
          className={`${btn} ml-auto bg-[#22c55e] text-black border-[#22c55e] font-black`}
          title={`Publica o rascunho de ${SCREEN_LABEL[screen]} nas arenas`}
        >
          {publishing ? "Aplicando…" : `Aplicar no telão (${SCREEN_LABEL[screen]})`}
        </button>
      </div>

      {msg && (
        <div role={msg.tone === "error" ? "alert" : "status"} className={`mb-3 rounded-lg px-3 py-2 text-sm flex flex-wrap items-center gap-2 ${msg.tone === "ok" ? "bg-green-500/10 border border-green-500/30 text-green-200" : msg.tone === "warn" ? "bg-amber-500/10 border border-amber-500/40 text-amber-100" : "bg-red-500/10 border border-red-500/40 text-red-200"}`}>
          <span className="flex-1">{msg.text}</span>
          {msg.tone === "error" && <button className={btnGhost} onClick={publish} disabled={publishing}>Tentar novamente</button>}
          <button className="min-h-[44px] min-w-[44px] text-gray-400" aria-label="Fechar mensagem" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {conflict && (
        <div role="alert" className="mb-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="font-bold">Conflito: a versão {conflict.version} foi publicada {conflict.publishedBy ? `por ${conflict.publishedBy} ` : ""}em {fmtDate(conflict.publishedAt)}.</p>
          <p className="mt-1">Seu rascunho continua salvo. Revise antes de decidir — nada é sobrescrito sem você confirmar.</p>
          {conflict.diff && <p className="mt-1">Diferenças entre a versão atual e o seu rascunho: <b>{conflict.diff.join(", ") || "nenhuma"}</b></p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={btnGhost} onClick={() => loadCurrent("diff")}>Ver diferenças</button>
            <button className={btnGhost} onClick={() => loadCurrent("load")}>Carregar versão atual</button>
            <button className={btnGhost} onClick={() => loadCurrent("rebase")}>Manter meu rascunho sobre a versão atual</button>
          </div>
        </div>
      )}
      {confirmRestore && (
        <div role="alertdialog" aria-labelledby="restore-t" className="mb-3 rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-gray-100">
          <p id="restore-t" className="font-bold text-white">Restaurar o padrão de {SCREEN_LABEL[screen]}?</p>
          <ul className="mt-1 list-disc pl-5">
            <li><b>Restaurados:</b> posição, tamanho e tipo de letra dos elementos padrão; todos voltam a aparecer e ficam desbloqueados.</li>
            <li><b>Preservados:</b> fundo, biblioteca de fontes e os campos personalizados (com posição e valor).</li>
            <li>Muda só o rascunho — dá para desfazer, e o telão só muda ao aplicar.</li>
          </ul>
          <div className="mt-2 flex gap-2">
            <button className={btnOn} onClick={() => { commit((c) => restoreDefaults(c, baseDefs)); setConfirmRestore(false); }}>Restaurar padrão</button>
            <button className={btnGhost} onClick={() => setConfirmRestore(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {showFonts && (
        <div className="mb-3 rounded-xl border border-line bg-card p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <b className="text-brand-yellow text-sm">Biblioteca de fontes (compartilhada pelas telas)</b>
            <input ref={fontInputRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" onChange={onPickFont} className="hidden" />
            <button className={`${btnGhost} ml-auto`} onClick={() => fontInputRef.current?.click()}>⬆ Enviar arquivo</button>
            <button className={btnGhost} onClick={addGoogleFont}>+ Google Fonts</button>
          </div>
          {library.length === 0 ? <p className="text-xs text-gray-400">Nenhuma fonte. Novas fontes passam a valer no telão quando uma tela que as usa for aplicada.</p> : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {library.map((f) => (
                <li key={f.family} className="rounded-lg border border-line bg-field px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white truncate">{f.family}</span>
                    <span className="text-[10px] uppercase text-gray-500">{f.kind === "upload" ? "arquivo" : "google"}</span>
                    <button className="ml-auto min-h-[36px] text-xs text-red-300" onClick={() => removeFont(f.family)}>remover</button>
                  </div>
                  <div className="text-2xl text-brand-yellow truncate" style={{ fontFamily: fontStack(f.family) }}>Placar 3 X 0 · AaBb</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {versions && (
        <div className="mb-3 rounded-xl border border-line bg-card p-3 text-sm">
          <div className="flex items-center mb-2"><b className="text-white">Versões publicadas de {SCREEN_LABEL[screen]}</b><button className="ml-auto min-h-[44px] min-w-[44px] text-gray-400" aria-label="Fechar versões" onClick={() => { setVersions(null); setCmp(null); }}>✕</button></div>
          {versions.length === 0 ? <p className="text-gray-400">Nenhuma versão publicada pelo editor ainda (o telão usa a configuração anterior).</p> : (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-field px-3 py-2">
                  <span className="flex-1 min-w-[10rem] text-gray-200">Versão <b className="text-white">{v.version}</b>{v.version === doc.base.version ? " (publicada)" : ""} · {v.publishedBy} · {fmtDate(v.publishedAt)}</span>
                  <button className={btnGhost} onClick={async () => { const c = await versionComp(v.id); if (c) { setView({ kind: "version", version: c.version, composition: c.composition }); setPreview(true); } }}>Ver</button>
                  <button className={btnGhost} onClick={async () => { const c = await versionComp(v.id); if (c) { const d = diffCompositions(doc.base.composition, c.composition); setCmp({ version: c.version, names: [...d.changed.map((k) => defs[k]?.label ?? k), ...d.meta] }); } }}>Comparar</button>
                  <button className={btnGhost} onClick={async () => { const c = await versionComp(v.id); if (c) { commit(() => c.composition); setView({ kind: "draft" }); setMsg({ tone: "warn", text: `Versão ${c.version} restaurada no rascunho. Revise e clique em Aplicar no telão para publicá-la.` }); } }}>Restaurar no rascunho</button>
                </li>
              ))}
            </ul>
          )}
          {cmp && <p className="mt-2 text-gray-200">Versão {cmp.version} × publicada: {cmp.names.length ? <>alterados: <b>{cmp.names.join(", ")}</b></> : "nenhuma diferença"}.</p>}
        </div>
      )}

      <div className={`flex gap-4 ${propsOpen ? "flex-col lg:flex-row" : "flex-col"}`}>
        {/* Board area: scrolls/pans when zoomed; dragging happens only on elements */}
        <div className="flex-1 min-w-0">
          {preview && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <label className="text-gray-300">Cenário
                <select value={scenario} onChange={(e) => { const sc = SCENARIOS.find((x) => x.key === e.target.value); setScenario(e.target.value); setSample({ ...BASE_SAMPLE, name1: profile.name, ...(sc?.patch ?? {}) }); }} className="ml-1 min-h-[44px] bg-field border border-line rounded px-2 text-white">
                  <option value="">Padrão</option>
                  {SCENARIOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <SampleInput label="Jogador 1" value={sample.name1} onChange={(v) => setSample({ ...sample, name1: v })} />
              <SampleInput label="Jogador 2" value={sample.name2} onChange={(v) => setSample({ ...sample, name2: v })} />
              <SampleInput label="Pontos 1" value={String(sample.score1)} numeric onChange={(v) => setSample({ ...sample, score1: Number(v) || 0 })} />
              <SampleInput label="Pontos 2" value={String(sample.score2)} numeric onChange={(v) => setSample({ ...sample, score2: Number(v) || 0 })} />
              <span className="text-xs text-gray-500">Dados de exemplo: não alteram perfis, partidas ou torneios.</span>
            </div>
          )}
          <div className="overflow-auto rounded-lg border border-line bg-black" style={{ maxHeight: fs ? "calc(100vh - 220px)" : "75vh" }}>
            <div style={{ width: `${zoom}%`, minWidth: zoom > 100 ? `${zoom}%` : undefined }}>
              {preview || view.kind !== "draft" ? (
                <PreviewBoard screen={screen} comp={shown} sbComp={sbComp} bg={bgOf(shown)} customs={previewCustoms} data={pv.data} match={pv.match} />
              ) : (
                <div
                  ref={boardRef}
                  onPointerDown={() => setSel(null)}
                  style={{ position: "relative", width: "100%", aspectRatio: "1672 / 941", containerType: "size", backgroundImage: `url(${bgOf(draft)})`, backgroundSize: "100% 100%", fontFamily: "'Arial Black', system-ui, sans-serif", touchAction: "pan-x pan-y", userSelect: "none", overflow: "hidden" }}
                >
                  {grid && <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)", backgroundSize: "5% 5%" }} />}
                  <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: 0, bottom: 0, borderLeft: "1px dashed rgba(0,170,255,0.35)", pointerEvents: "none" }} />
                  <div aria-hidden="true" style={{ position: "absolute", top: "50%", left: 0, right: 0, borderTop: "1px dashed rgba(0,170,255,0.35)", pointerEvents: "none" }} />
                  {guides.x !== null && <div aria-hidden="true" style={{ position: "absolute", left: `${guides.x}%`, top: 0, bottom: 0, borderLeft: "1px solid #ff3ea5", pointerEvents: "none", zIndex: 30 }} />}
                  {guides.y !== null && <div aria-hidden="true" style={{ position: "absolute", top: `${guides.y}%`, left: 0, right: 0, borderTop: "1px solid #ff3ea5", pointerEvents: "none", zIndex: 30 }} />}
                  {keys.map((k) => {
                    const f = draft.fields[k];
                    const def = defs[k];
                    if (!f || (isolate && sel && sel !== k)) return null;
                    const isSel = sel === k, isHidden = draft.hidden.includes(k), isLocked = locked(k);
                    const outline = isSel ? "2px solid #f0a500" : isHidden ? "1px dashed rgba(255,80,80,0.6)" : "1px dashed rgba(255,255,255,0.35)";
                    const common: React.CSSProperties = { position: "absolute", outline, opacity: isHidden ? 0.35 : 1, cursor: isLocked ? "default" : "move", zIndex: isSel ? 20 : 10, touchAction: "none" };
                    const handle = isSel && !isLocked ? (
                      <span onPointerDown={(e) => startDrag(e, k, "resize")} title={def.kind === "text" ? "Arraste para o tamanho do texto" : "Arraste para dimensionar"}
                        style={{ position: "absolute", right: -11, bottom: -11, width: 22, height: 22, background: "#f0a500", borderRadius: 4, cursor: "nwse-resize", touchAction: "none" }} />
                    ) : null;
                    if (def.kind === "text") {
                      return (
                        <div key={k} onPointerDown={(e) => startDrag(e, k, "move")} style={{ ...common, left: `${f.x}%`, top: `${f.y}%`, transform: "translate(-50%, -50%)", width: `${f.w ?? 12}%`, display: "flex", justifyContent: "center", fontFamily: fontStack(f.ff), fontSize: `${f.fs ?? 1.5}cqw`, fontWeight: 900, color: "#fff", whiteSpace: "nowrap", overflow: "visible" }}>
                          <span style={{ display: "block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{sampleText(k)}</span>
                          {isLocked && <span style={{ position: "absolute", left: -2, top: -14, fontSize: 11 }}>🔒</span>}
                          {handle}
                        </div>
                      );
                    }
                    const isPip = def.kind === "pipsV" || def.kind === "pipsH";
                    return (
                      <div key={k} onPointerDown={(e) => startDrag(e, k, "move")} style={{ ...common, left: `${f.x}%`, top: `${f.y}%`, width: `${f.w ?? 10}%`, height: `${f.h ?? 10}%`, background: isPip ? "rgba(240,165,0,0.06)" : "rgba(240,165,0,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1cqw", fontWeight: 800, color: "#ffd400" }}>
                        {isPip
                          ? pipDots(f, def.kind === "pipsV" ? "v" : "h").map((d, i) => (
                              <span key={i} style={{ position: "absolute", left: `${((d.cx - f.x) / (f.w || 1)) * 100}%`, top: `${((d.cy - f.y) / (f.h || 1)) * 100}%`, transform: "translate(-50%, -50%)", width: `${f.fs ?? 1.5}cqw`, height: `${f.fs ?? 1.5}cqw`, borderRadius: "50%", background: "#ffd400" }} />
                            ))
                          : def.label}
                        {isLocked && <span style={{ position: "absolute", left: 2, top: 2, fontSize: 11 }}>🔒</span>}
                        {handle}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Valores em % do quadro original (1672 × 941), iguais em qualquer zoom. Texto: posição = centro, “Tamanho do texto” em % da largura do quadro. Imagens: posição = canto superior esquerdo.
            Setas movem 0,1% (Shift: 1%). Arraste o fundo para rolar o quadro; arraste um elemento para movê-lo.
          </p>
        </div>

        {propsOpen && (
          <aside className="w-full lg:w-80 shrink-0 rounded-xl border border-line bg-card p-3 space-y-4" aria-label="Painel de propriedades">
            {/* Properties */}
            {selDef && selField && view.kind === "draft" ? (
              <section aria-labelledby="props-t" className="space-y-2">
                <h2 id="props-t" className="text-sm font-black text-brand-yellow">{selDef.label}{locked(sel!) && <span className="ml-2 text-xs text-gray-400">🔒 bloqueado</span>}</h2>
                <fieldset disabled={locked(sel!) || preview} className="space-y-2 disabled:opacity-60">
                  <SliderNum label="Posição horizontal (%)" value={selField.x} min={-20} max={120} step={0.1} onLive={(v) => { beginGesture(); liveField(sel!, { x: v }); }} onEnd={endGesture} onCommit={(v) => setField(sel!, { x: v })} />
                  <SliderNum label="Posição vertical (%)" value={selField.y} min={-20} max={120} step={0.1} onLive={(v) => { beginGesture(); liveField(sel!, { y: v }); }} onEnd={endGesture} onCommit={(v) => setField(sel!, { y: v })} />
                  {selDef.kind !== "text" ? (
                    <>
                      <SliderNum label="Largura (%)" value={selField.w ?? 10} min={0.5} max={100} step={0.1}
                        onLive={(v) => { beginGesture(); liveField(sel!, selDef.kind === "img" && draft.keepRatio.includes(sel!) ? resizeKeepRatio(selField, v) : { w: v }); }} onEnd={endGesture}
                        onCommit={(v) => setField(sel!, selDef.kind === "img" && draft.keepRatio.includes(sel!) ? resizeKeepRatio(selField, v) : { w: v })} />
                      <SliderNum label="Altura (%)" value={selField.h ?? 10} min={0.5} max={100} step={0.1} disabled={selDef.kind === "img" && draft.keepRatio.includes(sel!)}
                        onLive={(v) => { beginGesture(); liveField(sel!, { h: v }); }} onEnd={endGesture} onCommit={(v) => setField(sel!, { h: v })} />
                      {selDef.kind === "img" && (
                        <label className="flex items-center gap-2 min-h-[44px] text-sm text-gray-200">
                          <input type="checkbox" className="w-5 h-5" checked={draft.keepRatio.includes(sel!)} onChange={() => toggleIn("keepRatio", sel!)} />
                          Manter proporção
                        </label>
                      )}
                      {(selDef.kind === "pipsV" || selDef.kind === "pipsH") && (
                        <SliderNum label="Tamanho da bolinha (% da largura)" value={selField.fs ?? 1.5} min={0.2} max={10} step={0.1} onLive={(v) => { beginGesture(); liveField(sel!, { fs: v }); }} onEnd={endGesture} onCommit={(v) => setField(sel!, { fs: v })} />
                      )}
                    </>
                  ) : (
                    <>
                      <SliderNum label="Largura máxima (%)" value={selField.w ?? 12} min={0.5} max={100} step={0.1} onLive={(v) => { beginGesture(); liveField(sel!, { w: v }); }} onEnd={endGesture} onCommit={(v) => setField(sel!, { w: v })} />
                      <SliderNum label="Tamanho do texto (% da largura)" value={selField.fs ?? 1.5} min={0.2} max={30} step={0.1} onLive={(v) => { beginGesture(); liveField(sel!, { fs: v }); }} onEnd={endGesture} onCommit={(v) => setField(sel!, { fs: v })} />
                      <label className="block text-xs text-gray-400">Tipo de letra
                        <select value={selField.ff ?? ""} onChange={(e) => setField(sel!, { ff: e.target.value || undefined })} className="mt-0.5 w-full min-h-[44px] bg-field border border-line rounded px-2 text-white">
                          <option value="">Padrão (Arial Black)</option>
                          {library.map((f) => <option key={f.family} value={f.family}>{f.family}</option>)}
                        </select>
                      </label>
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button className={btnGhost} onClick={() => setField(sel!, centered(selDef.kind, selField, "h"))}>Centralizar horizontalmente</button>
                    <button className={btnGhost} onClick={() => setField(sel!, centered(selDef.kind, selField, "v"))}>Centralizar verticalmente</button>
                    <button className={btnGhost} disabled={!hasPair} onClick={() => commit((c) => ({ ...c, fields: { ...c.fields, [pair!]: { ...c.fields[sel!], ...mirrorField(selDef.kind, c.fields[sel!]) } } }))}>⇄ Espelhar para o outro lado</button>
                    <button className={btnGhost} disabled={!hasPair} onClick={() => setField(sel!, { y: draft.fields[pair!].y })}>Alinhar altura com o par</button>
                  </div>
                </fieldset>
                {isCustomKey(sel!) && customOf(sel!) && (
                  <div className="space-y-2 border-t border-line pt-2">
                    <TextProp label="Nome do campo" value={customOf(sel!)!.label} max={40} onCommit={(v) => v.trim() && setCustom(sel!, { label: v.trim() })} />
                    <label className="block text-xs text-gray-400">Tipo
                      <select value={customOf(sel!)!.type} onChange={(e) => setCustom(sel!, { type: e.target.value as "text" | "int", value: e.target.value === "int" ? String(parseInt(customOf(sel!)!.value) || 0) : customOf(sel!)!.value })} className="mt-0.5 w-full min-h-[44px] bg-field border border-line rounded px-2 text-white">
                        <option value="text">Texto</option>
                        <option value="int">Número (inteiro)</option>
                      </select>
                    </label>
                    <TextProp label="Valor exibido" value={customOf(sel!)!.value} max={60} pattern={customOf(sel!)!.type === "int" ? /^-?\d*$/ : undefined} onCommit={(v) => setCustom(sel!, { value: v })} />
                    <button className="min-h-[44px] text-sm text-red-300 underline" onClick={() => deleteCustom(sel!)}>Excluir campo</button>
                  </div>
                )}
                {!isCustomKey(sel!) && <button className="min-h-[44px] text-sm text-gray-300 underline" onClick={() => restoreElement(sel!)}>Restaurar padrão deste elemento</button>}
              </section>
            ) : (
              <p className="text-xs text-gray-400">Selecione um elemento na lista ou no quadro para ver as propriedades. Selecionar não muda a visibilidade.</p>
            )}

            {/* Layers */}
            <section aria-labelledby="layers-t">
              <div className="flex items-center gap-2 mb-2">
                <h2 id="layers-t" className="text-sm font-black text-white">Camadas</h2>
                <label className="ml-auto flex items-center gap-1 text-xs text-gray-400 min-h-[44px]"><input type="checkbox" className="w-4 h-4" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} /> Isolar seleção</label>
              </div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar elemento" aria-label="Buscar elemento" className="w-full min-h-[44px] mb-2 bg-field border border-line rounded px-2 text-white text-sm" />
              {screen === "scoreboard" && (
                <div className="flex gap-2 mb-2">
                  <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Novo campo (ex.: Mesa)" maxLength={40} aria-label="Nome do novo campo" className="flex-1 min-w-0 min-h-[44px] bg-field border border-line rounded px-2 text-white text-sm" />
                  <select value={newType} onChange={(e) => setNewType(e.target.value as "text" | "int")} aria-label="Tipo do novo campo" className="min-h-[44px] bg-field border border-line rounded px-1 text-white text-sm"><option value="text">Texto</option><option value="int">Nº</option></select>
                  <button className={btnGhost} onClick={addCustom} disabled={!newLabel.trim() || !editing}>Inserir</button>
                </div>
              )}
              {groups.map(([g, ks]) => (
                <div key={g} className="mb-3">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-400">{GROUP_LABEL[g]}</span>
                    <button className="ml-auto min-h-[36px] px-2 text-[11px] text-gray-300 border border-line rounded" onClick={() => lockGroup(ks, true)} disabled={!editing}>Bloquear grupo</button>
                    <button className="min-h-[36px] px-2 text-[11px] text-gray-300 border border-line rounded" onClick={() => lockGroup(ks, false)} disabled={!editing}>Desbloquear</button>
                  </div>
                  <ul className="space-y-1">
                    {ks.map((k) => {
                      const isHidden = draft.hidden.includes(k);
                      return (
                        <li key={k} className={`flex items-center rounded ${sel === k ? "bg-brand-yellow/20 ring-1 ring-brand-yellow" : "bg-field"}`}>
                          <button onClick={() => setSel(k)} aria-current={sel === k ? "true" : undefined} className={`flex-1 min-w-0 min-h-[44px] px-2 text-left text-sm truncate ${isHidden ? "text-gray-500 line-through" : "text-white"}`}>{defs[k].label}</button>
                          <button onClick={() => toggleIn("hidden", k)} disabled={!hiddenEditable || !editing} aria-pressed={!isHidden} aria-label={`${isHidden ? "Mostrar" : "Ocultar"} ${defs[k].label} no telão`} title={hiddenEditable ? (isHidden ? "Oculto no telão" : "Visível no telão") : "Visibilidade vem do Placar"} className="min-w-[44px] min-h-[44px] text-lg disabled:opacity-40">{isHidden ? "🙈" : "👁"}</button>
                          <button onClick={() => toggleIn("locked", k)} disabled={!editing} aria-pressed={locked(k)} aria-label={`${locked(k) ? "Desbloquear" : "Bloquear"} ${defs[k].label}`} title={locked(k) ? "Bloqueado: não move nem redimensiona" : "Livre"} className="min-w-[44px] min-h-[44px] text-lg disabled:opacity-40">{locked(k) ? "🔒" : "🔓"}</button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>

            {/* Arena confirmations */}
            <section aria-labelledby="acks-t" className="border-t border-line pt-3">
              <h2 id="acks-t" className="text-sm font-black text-white">Telões</h2>
              <p className="text-xs text-gray-400 mb-1">Layout publicado: Placar v{docs.scoreboard.base.version} · Vencedor v{docs.winner.base.version}. Abaixo, só os telões que <b>confirmaram</b> o carregamento (últimas 24 h).</p>
              {!acks || acks.length === 0 ? <p className="text-xs text-gray-500">Nenhuma confirmação recebida.</p> : (
                <ul className="space-y-1 text-xs">
                  {acks.map((a) => {
                    const ok = a.versions.scoreboard === docs.scoreboard.base.version && a.versions.winner === docs.winner.base.version;
                    return (
                      <li key={a.deviceId} className={ok ? "text-green-300" : "text-amber-200"}>
                        {ok ? "● " : "◐ "}Arena {a.arena} ({a.community.toUpperCase()}) · aparelho {a.deviceId.slice(0, 6)} · Placar v{a.versions.scoreboard ?? "?"} · Vencedor v{a.versions.winner ?? "?"} · {ok ? "atualizado" : "ainda não confirmou a versão atual"} · {fmtDate(new Date(a.at).toISOString())}
                      </li>
                    );
                  })}
                </ul>
              )}
              <button className={`${btnGhost} mt-2`} onClick={loadAcks}>Atualizar confirmações</button>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}

/** Preview with the SAME renderer as the telão (components/arena/Boards). */
function PreviewBoard({ screen, comp, sbComp, bg, customs, data, match }: {
  screen: Screen; comp: Composition; sbComp: Composition; bg: string; customs: CustomFld[];
  data: ReturnType<typeof buildPreview>["data"]; match: ReturnType<typeof buildPreview>["match"];
}) {
  if (screen === "winner") {
    return (
      <HiddenCtx.Provider value={new Set(comp.hidden)}>
        <WinnerScreen match={match} winnerSide="p1" layout={comp.fields} bg={bg} frame="container" />
      </HiddenCtx.Provider>
    );
  }
  // Partida rápida: its own positions + the Placar's customs/visibility (as on the real screen).
  const hidden = new Set(screen === "quickmatch" ? sbComp.hidden : comp.hidden);
  return (
    <HiddenCtx.Provider value={hidden}>
      <Scoreboard arena={1} data={data} match={match} build="prévia" layout={comp.fields} bg={bg} customFields={customs} onTest={() => { /* preview never starts anything */ }} frame="container" />
    </HiddenCtx.Provider>
  );
}

/**
 * Number field + slider. Typing may leave the field empty for a moment; the
 * value is validated and normalized on Enter/blur (empty or invalid → the last
 * valid value comes back, never a silent 0). The slider changes live and is
 * ONE undo step per drag.
 */
function SliderNum({ label, value, min, max, step, disabled, onLive, onEnd, onCommit }: {
  label: string; value: number; min: number; max: number; step: number; disabled?: boolean;
  onLive: (v: number) => void; onEnd: () => void; onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(String(value)); }, [value, focused]);
  const confirm = () => {
    const n = Number(text.replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(n)) { setText(String(value)); return; }
    const v = Math.round(Math.max(min, Math.min(max, n)) * 100) / 100;
    setText(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <div>
      <label className="block text-xs text-gray-400">{label}
        <div className="mt-0.5 flex items-center gap-2">
          <input type="range" min={min} max={max} step={step} value={Math.max(min, Math.min(max, value))} disabled={disabled} aria-label={`${label} (controle deslizante)`}
            onChange={(e) => onLive(Number(e.target.value))} onPointerUp={onEnd} onKeyUp={onEnd} onBlur={onEnd} className="flex-1 min-h-[44px] accent-[#f0a500]" />
          <input type="text" inputMode="decimal" value={text} disabled={disabled} aria-label={label}
            onFocus={() => setFocused(true)}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => { setFocused(false); confirm(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } if (e.key === "Escape") { setText(String(value)); (e.target as HTMLInputElement).blur(); } }}
            className="w-20 min-h-[44px] bg-field border border-line rounded px-2 text-white text-sm text-right" />
        </div>
      </label>
    </div>
  );
}

function TextProp({ label, value, max, pattern, onCommit }: { label: string; value: string; max: number; pattern?: RegExp; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const confirm = () => { if (pattern && !pattern.test(text)) { setText(value); return; } if (text !== value) onCommit(text.slice(0, max)); };
  return (
    <label className="block text-xs text-gray-400">{label}
      <input value={text} maxLength={max} onChange={(e) => setText(e.target.value)} onBlur={confirm} onKeyDown={(e) => { if (e.key === "Enter") confirm(); }}
        className="mt-0.5 w-full min-h-[44px] bg-field border border-line rounded px-2 text-white text-sm" />
    </label>
  );
}

function SampleInput({ label, value, numeric, onChange }: { label: string; value: string; numeric?: boolean; onChange: (v: string) => void }) {
  return (
    <label className="text-xs text-gray-400">{label}
      <input value={value} inputMode={numeric ? "numeric" : "text"} onChange={(e) => onChange(e.target.value)} className={`ml-1 min-h-[44px] bg-field border border-line rounded px-2 text-white text-sm ${numeric ? "w-16" : "w-36"}`} />
    </label>
  );
}
