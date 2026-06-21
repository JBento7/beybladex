import { prisma } from "@/lib/prisma";
import MyDeckEditor from "./MyDeckEditor";

type StatKey = "statAttack" | "statDefense" | "statStamina" | "statDash" | "statBurst";

const STAT_DEFS: { key: StatKey; label: string; color: string }[] = [
  { key: "statAttack",  label: "ATK", color: "#e53e3e" },
  { key: "statDefense", label: "DEF", color: "#3182ce" },
  { key: "statStamina", label: "STA", color: "#38a169" },
  { key: "statDash",    label: "DSH", color: "#d69e2e" },
  { key: "statBurst",   label: "BST", color: "#dd6b20" },
];

interface CombinedStats {
  statAttack: number; statDefense: number; statStamina: number;
  statHeight: number; statDash: number; statBurst: number;
}

function sumStats(parts: (Partial<CombinedStats> | null | undefined)[]): CombinedStats {
  const r: CombinedStats = { statAttack: 0, statDefense: 0, statStamina: 0, statHeight: 0, statDash: 0, statBurst: 0 };
  for (const p of parts) {
    if (!p) continue;
    for (const k of Object.keys(r) as (keyof CombinedStats)[]) r[k] += (p[k] ?? 0) as number;
  }
  return r;
}

const TYPE_IMAGES: Record<string, string> = {
  ATTACK:  "/ataque.png",
  DEFENSE: "/defesa.png",
  STAMINA: "/resistencia.png",
  BALANCE: "/equilibrio.png",
};

function detectType(stats: CombinedStats): string | null {
  const atk = stats.statAttack;
  const def = stats.statDefense;
  const sta = stats.statStamina;
  if (atk === 0 && def === 0 && sta === 0) return null;
  const max = Math.max(atk, def, sta);
  const threshold = max * 0.85;
  const close = [atk, def, sta].filter((v) => v >= threshold).length;
  if (close >= 3) return "BALANCE";
  if (atk === max) return "ATTACK";
  if (def === max) return "DEFENSE";
  return "STAMINA";
}


function RadarChart({ stats, size = 130 }: { stats: CombinedStats; size?: number }) {
  // HEIGHT excluded from radar display
  const axes = STAT_DEFS.filter((s) => stats[s.key] > 0);
  if (axes.length < 3) return <p className="text-[10px] text-gray-600 italic text-center py-3">Sem stats</p>;

  const cx = size / 2, cy = size / 2;
  const r = size * 0.33, labelR = size * 0.45;
  const n = axes.length;
  const maxVal = Math.max(...axes.map((s) => stats[s.key]), 1);
  const angles = axes.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / n);
  const vals = axes.map((s) => stats[s.key] / maxVal);

  const polyPts = (frac: number) =>
    angles.map((a) => `${cx + Math.cos(a) * r * frac},${cy + Math.sin(a) * r * frac}`).join(" ");
  const dataPts = vals.map((v, i) => `${cx + Math.cos(angles[i]) * r * v},${cy + Math.sin(angles[i]) * r * v}`);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={polyPts(f)} fill="none" stroke="#333" strokeWidth="0.8" />
      ))}
      {angles.map((a, i) => (
        <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke="#444" strokeWidth="0.8" />
      ))}
      <path d={`M${dataPts.join("L")}Z`} fill="#f0a500" fillOpacity="0.25" stroke="#f0a500" strokeWidth="1.5" />
      {angles.map((a, i) => (
        <text key={i} x={cx + Math.cos(a) * labelR} y={cy + Math.sin(a) * labelR}
          textAnchor="middle" dominantBaseline="central"
          fill={axes[i].color} fontSize="7" fontWeight="bold" fontFamily="sans-serif">
          {axes[i].label}
        </text>
      ))}
    </svg>
  );
}

function StatBars({ stats }: { stats: CombinedStats }) {
  const active = STAT_DEFS.filter((s) => stats[s.key] > 0);
  if (active.length === 0) return null;
  const maxVal = Math.max(...active.map((s) => stats[s.key]));
  return (
    <div className="space-y-1">
      {active.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold w-7 text-right" style={{ color: s.color }}>{s.label}</span>
          <div className="flex-1 h-1 bg-[#111] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(stats[s.key] / maxVal) * 100}%`, backgroundColor: s.color }} />
          </div>
          <span className="text-[9px] font-bold text-white w-5 text-right">{stats[s.key]}</span>
        </div>
      ))}
    </div>
  );
}

interface DeckBeyInfo {
  id: string;
  name: string;
  beyLine: string | null;
  blade: string | null;
  ratchet: string | null;
  bit: string | null;
  lockChip: string | null;
  metalBlade: string | null;
  assistBlade: string | null;
  overBlade: string | null;
  bladeImageUrl: string | null;
  lockChipImageUrl: string | null;
  metalBladeImageUrl: string | null;
  overBladeImageUrl: string | null;
  stats: CombinedStats;
}

const LINE_LABELS: Record<string, string> = {
  BX: "BX", UX: "UX", CX: "CX",
  BX_EXPAND: "BX Expand", UX_EXPAND: "UX Expand", CX_EXPAND: "CX Expand",
};

function isCX(line: string | null) {
  return line === "CX" || line === "CX_EXPAND";
}

function partsList(b: DeckBeyInfo): string {
  if (isCX(b.beyLine)) {
    return [b.lockChip, b.overBlade, b.metalBlade, b.assistBlade, b.ratchet, b.bit].filter(Boolean).join(" / ");
  }
  return [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");
}

function PartThumb({ img, label }: { img: string | null; label: string }) {
  return (
    <div className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-[#333] overflow-hidden flex items-center justify-center flex-shrink-0">
      {img
        ? <img src={img} alt={label} className="w-full h-full object-contain p-0.5" /> // eslint-disable-line @next/next/no-img-element
        : <span className="text-[8px] text-gray-700 text-center leading-tight px-0.5">{label}</span>
      }
    </div>
  );
}

function BeyCard({ bey, slot }: { bey: DeckBeyInfo; slot: number }) {
  const slotColors  = ["border-[#f0a500]/50", "border-[#c8102e]/50", "border-blue-500/50"];
  const slotAccents = ["text-[#f0a500]", "text-[#c8102e]", "text-blue-400"];
  const parts = partsList(bey);
  const hasCXSplit = isCX(bey.beyLine);

  return (
    <div className={`bg-[#252525] border ${slotColors[slot]} rounded-xl overflow-hidden flex flex-col`}>
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-[#333]">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] font-black ${slotAccents[slot]} uppercase tracking-wider`}>
            Bey {slot + 1}
          </span>
          {bey.beyLine && (
            <span className="text-[10px] font-bold bg-[#f0a500]/10 text-[#f0a500] px-1.5 py-0.5 rounded">
              {LINE_LABELS[bey.beyLine] ?? bey.beyLine}
            </span>
          )}
        </div>
        <div className="font-bold text-sm text-white truncate">{bey.name}</div>
        {parts && <div className="text-[10px] text-gray-500 mt-0.5 truncate">{parts}</div>}
      </div>

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col gap-3">
        {hasCXSplit ? (
          <div className="flex gap-2 items-start">
            <div className="flex gap-1.5 flex-shrink-0">
              <PartThumb img={bey.lockChipImageUrl}   label={bey.lockChip   ?? "Lock"} />
              {bey.overBlade && (
                <PartThumb img={bey.overBladeImageUrl} label={bey.overBlade} />
              )}
              <PartThumb img={bey.metalBladeImageUrl} label={bey.metalBlade ?? "Metal"} />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5 pt-0.5">
              {[
                { label: "Lock",   val: bey.lockChip },
                ...(bey.overBlade ? [{ label: "Over",   val: bey.overBlade }] : []),
                { label: "Metal",  val: bey.metalBlade },
                { label: "Assist", val: bey.assistBlade },
                { label: "Ratchet", val: bey.ratchet },
                { label: "Bit",    val: bey.bit },
              ].map(({ label, val }) => val ? (
                <div key={label} className="flex items-center gap-1">
                  <span className="text-[9px] text-gray-500 w-10 flex-shrink-0">{label}</span>
                  <span className="text-[10px] text-gray-300 truncate">{val}</span>
                </div>
              ) : null)}
            </div>
          </div>
        ) : (
          <div className="flex gap-3 items-start">
            <div className="w-14 h-14 flex-shrink-0 rounded-lg bg-[#1a1a1a] border border-[#333] overflow-hidden flex items-center justify-center">
              {bey.bladeImageUrl
                ? <img src={bey.bladeImageUrl} alt={bey.blade ?? "blade"} className="w-full h-full object-contain p-1" /> // eslint-disable-line @next/next/no-img-element
                : <span className="text-[9px] text-gray-700 text-center leading-tight px-1">{bey.blade ?? "Blade"}</span>
              }
            </div>
            <div className="flex-1 min-w-0 space-y-0.5 pt-0.5">
              {[
                { label: "Blade",   val: bey.blade },
                { label: "Ratchet", val: bey.ratchet },
                { label: "Bit",     val: bey.bit },
              ].map(({ label, val }) => val ? (
                <div key={label} className="flex items-center gap-1">
                  <span className="text-[9px] text-gray-500 w-10 flex-shrink-0">{label}</span>
                  <span className="text-[10px] text-gray-300 truncate">{val}</span>
                </div>
              ) : null)}
            </div>
          </div>
        )}

        {(() => {
          const type = detectType(bey.stats);
          return (
            <div className="flex items-center justify-center gap-3">
              <RadarChart stats={bey.stats} size={120} />
              {type && (
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={TYPE_IMAGES[type]} alt={type} className="w-10 h-10 object-contain" />
                </div>
              )}
            </div>
          );
        })()}

        <StatBars stats={bey.stats} />
      </div>
    </div>
  );
}

// ── server component ──────────────────────────────────────────────────────────

function isCXLine(line: string | null) { return line === "CX" || line === "CX_EXPAND"; }

export default async function MyDeckSection({
  userId,
  readOnly = false,
  featuredOnly = false,
  title = "Meu Deck",
}: {
  userId: string;
  readOnly?: boolean;
  featuredOnly?: boolean;
  title?: string;
}) {
  // Fetch user's featured deck + all their beyblades (for editor)
  const [userRecord, allUserBeyblades] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { featuredBey1: true, featuredBey2: true, featuredBey3: true },
    }),
    prisma.beyblade.findMany({
      where: { userId },
      select: { id: true, name: true, beyLine: true, blade: true, ratchet: true, bit: true, lockChip: true, metalBlade: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Determine source: featured deck or tournament fallback
  const featuredIds = [userRecord?.featuredBey1, userRecord?.featuredBey2, userRecord?.featuredBey3].filter(Boolean) as string[];
  let bIds: string[];
  let deckSource: { type: "featured" } | { type: "tournament"; name: string; status: string } | null = null;

  if (featuredIds.length > 0) {
    bIds = featuredIds;
    deckSource = { type: "featured" };
  } else if (featuredOnly) {
    // Community view: only show an explicitly-chosen featured deck.
    return null;
  } else {
    // Fall back to most recent tournament deck
    let participation = await prisma.tournamentParticipant.findFirst({
      where: { userId, beyblade1: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        beyblade1: true, beyblade2: true, beyblade3: true,
        tournament: { select: { name: true, status: true } },
      },
    });

    if (!participation) return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {!readOnly && <MyDeckEditor allBeyblades={allUserBeyblades} currentIds={[]} isFeatured={false} />}
        </div>
        <p className="text-sm text-gray-500 text-center py-4">Nenhum torneio com combo registrado ainda.</p>
      </div>
    );

    if (participation.tournament.status === "FINISHED") {
      const active = await prisma.tournamentParticipant.findFirst({
        where: { userId, beyblade1: { not: null }, tournament: { status: { in: ["IN_PROGRESS", "REGISTRATION"] } } },
        orderBy: { createdAt: "desc" },
        select: {
          beyblade1: true, beyblade2: true, beyblade3: true,
          tournament: { select: { name: true, status: true } },
        },
      });
      if (active) participation = active;
    }

    bIds = [participation.beyblade1, participation.beyblade2, participation.beyblade3].filter(Boolean) as string[];
    if (bIds.length === 0) return null;
    deckSource = { type: "tournament", name: participation.tournament.name, status: participation.tournament.status };
  }

  const beyblades = await prisma.beyblade.findMany({ where: { id: { in: bIds } } });
  const beyMap = Object.fromEntries(beyblades.map((b) => [b.id, b]));

  const partLookups: { name: string; line: string; category: string }[] = [];
  for (const b of beyblades) {
    const line = b.beyLine ?? "";
    const cxLine = line === "CX_EXPAND" ? "CX_EXPAND" : "CX";
    if (!isCXLine(line)) {
      if (b.blade)   partLookups.push({ name: b.blade,   line,         category: "BLADE" });
      if (b.ratchet) partLookups.push({ name: b.ratchet, line: "RATCHET", category: "RATCHET" });
      if (b.bit)     partLookups.push({ name: b.bit,     line: "BIT",     category: "BIT" });
    } else {
      // lock chip and assist blade shared across CX and CX_EXPAND — push lookups for both lines
      if (b.lockChip)    { partLookups.push({ name: b.lockChip,    line: "CX",       category: "LOCK_CHIP" });   partLookups.push({ name: b.lockChip,    line: "CX_EXPAND", category: "LOCK_CHIP" }); }
      if (b.metalBlade)    partLookups.push({ name: b.metalBlade,  line: cxLine,     category: "MAIN_BLADE" });
      if (b.assistBlade) { partLookups.push({ name: b.assistBlade, line: "CX",       category: "ASSIST_BLADE" }); partLookups.push({ name: b.assistBlade, line: "CX_EXPAND", category: "ASSIST_BLADE" }); }
      if (b.overBlade)     partLookups.push({ name: b.overBlade,   line: "CX_EXPAND", category: "OVER_BLADE" });
      if (b.ratchet)       partLookups.push({ name: b.ratchet,     line: "RATCHET",  category: "RATCHET" });
      if (b.bit)           partLookups.push({ name: b.bit,         line: "BIT",      category: "BIT" });
    }
  }

  const allPartNames = [...new Set(partLookups.map((p) => p.name))];
  const foundParts = allPartNames.length
    ? await prisma.beyPart.findMany({ where: { name: { in: allPartNames } } })
    : [];

  function findPart(name: string | null, line: string, category: string) {
    if (!name) return null;
    return foundParts.find((p) => p.name === name && p.line === line && p.category === category) ?? null;
  }

  const deckBeys: DeckBeyInfo[] = bIds.map((id) => {
    const b = beyMap[id];
    if (!b) return null;
    const line    = b.beyLine ?? "";
    const cxLine  = line === "CX_EXPAND" ? "CX_EXPAND" : "CX";
    const cx      = isCXLine(line);

    const bladePart      = cx ? null : findPart(b.blade, line, "BLADE");
    const ratchetPart    = findPart(b.ratchet, "RATCHET", "RATCHET");
    const bitPart        = findPart(b.bit, "BIT", "BIT");
    const lockChipPart   = cx ? (findPart(b.lockChip,   "CX", "LOCK_CHIP")   ?? findPart(b.lockChip,   "CX_EXPAND", "LOCK_CHIP"))   : null;
    const metalBladePart = cx ? findPart(b.metalBlade, cxLine, "MAIN_BLADE") : null;
    const assistBladePart = cx ? (findPart(b.assistBlade, "CX", "ASSIST_BLADE") ?? findPart(b.assistBlade, "CX_EXPAND", "ASSIST_BLADE")) : null;
    const overBladePart  = cx ? findPart(b.overBlade, "CX_EXPAND", "OVER_BLADE") : null;

    const partsForStats = (cx
      ? [metalBladePart, assistBladePart, overBladePart, ratchetPart, bitPart]
      : [bladePart, ratchetPart, bitPart]
    ).map((p) => p ? {
      statAttack:  p.statAttack  ?? 0, statDefense: p.statDefense ?? 0,
      statStamina: p.statStamina ?? 0, statHeight:  p.statHeight  ?? 0,
      statDash:    p.statDash    ?? 0, statBurst:   p.statBurst   ?? 0,
    } : null);

    return {
      id: b.id, name: b.name, beyLine: b.beyLine,
      blade: b.blade, ratchet: b.ratchet, bit: b.bit,
      lockChip: b.lockChip, metalBlade: b.metalBlade, assistBlade: b.assistBlade, overBlade: b.overBlade,
      bladeImageUrl:      bladePart?.imageUrl      ?? null,
      lockChipImageUrl:   lockChipPart?.imageUrl   ?? null,
      metalBladeImageUrl: metalBladePart?.imageUrl ?? null,
      overBladeImageUrl:  overBladePart?.imageUrl  ?? null,
      stats: sumStats(partsForStats),
    } satisfies DeckBeyInfo;
  }).filter(Boolean) as DeckBeyInfo[];

  if (deckBeys.length === 0) return null;

  const statusLabel: Record<string, string> = {
    IN_PROGRESS: "Em andamento", REGISTRATION: "Inscrições abertas",
    FINISHED: "Finalizado", DRAFT: "Rascunho",
  };

  const isFeatured = deckSource?.type === "featured";

  return (
    <div className={`bg-[#1a1a1a] border rounded-xl p-6 ${isFeatured ? "border-[#f0a500]/30" : "border-[#2a2a2a]"}`}>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">{title}</h2>
            {isFeatured && (
              <span className="text-[10px] font-black bg-[#f0a500] text-black px-2 py-0.5 rounded-full tracking-wider">
                DESTAQUE
              </span>
            )}
          </div>
          {deckSource?.type === "tournament" && (
            <p className="text-sm text-gray-500 mt-0.5">
              {deckSource.name}
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                deckSource.status === "IN_PROGRESS"   ? "bg-green-500/20 text-green-400"
                : deckSource.status === "REGISTRATION" ? "bg-[#f0a500]/20 text-[#f0a500]"
                : "bg-gray-700 text-gray-400"
              }`}>
                {statusLabel[deckSource.status] ?? deckSource.status}
              </span>
            </p>
          )}
        </div>
        {!readOnly && (
          <MyDeckEditor
            allBeyblades={allUserBeyblades}
            currentIds={isFeatured ? featuredIds : []}
            isFeatured={isFeatured}
          />
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {deckBeys.map((bey, i) => (
          <BeyCard key={bey.id} bey={bey} slot={i} />
        ))}
      </div>
    </div>
  );
}
