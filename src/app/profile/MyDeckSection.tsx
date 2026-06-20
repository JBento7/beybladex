import { prisma } from "@/lib/prisma";

type StatKey = "statAttack" | "statDefense" | "statStamina" | "statHeight" | "statDash" | "statBurst";

const STAT_DEFS: { key: StatKey; label: string; color: string }[] = [
  { key: "statAttack",  label: "ATK",   color: "#e53e3e" },
  { key: "statDefense", label: "DEF",   color: "#3182ce" },
  { key: "statStamina", label: "STA",   color: "#38a169" },
  { key: "statHeight",  label: "HGT",   color: "#805ad5" },
  { key: "statDash",    label: "XDASH", color: "#d69e2e" },
  { key: "statBurst",   label: "BR",    color: "#dd6b20" },
];

interface CombinedStats {
  statAttack: number; statDefense: number; statStamina: number;
  statHeight: number; statDash: number; statBurst: number;
}

function sumStats(parts: (Partial<CombinedStats> | null | undefined)[]): CombinedStats {
  const r: CombinedStats = { statAttack: 0, statDefense: 0, statStamina: 0, statHeight: 0, statDash: 0, statBurst: 0 };
  for (const p of parts) {
    if (!p) continue;
    for (const k of Object.keys(r) as StatKey[]) r[k] += (p[k] ?? 0) as number;
  }
  return r;
}

// Radar with value labels: "ATK (62)"
function RadarChart({ stats, size = 180 }: { stats: CombinedStats; size?: number }) {
  const axes = STAT_DEFS.filter((s) => stats[s.key] > 0);
  if (axes.length < 3) return <p className="text-[10px] text-gray-600 italic text-center py-4">Sem stats</p>;

  const cx = size / 2, cy = size / 2;
  const r = size * 0.30;
  const labelR = size * 0.46;
  const n = axes.length;
  const maxVal = Math.max(...axes.map((s) => stats[s.key]), 1);
  const angles = axes.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / n);
  const vals = axes.map((s) => stats[s.key] / maxVal);

  const polyPts = (frac: number) =>
    angles.map((a) => `${cx + Math.cos(a) * r * frac},${cy + Math.sin(a) * r * frac}`).join(" ");
  const dataPts = vals.map((v, i) =>
    `${cx + Math.cos(angles[i]) * r * v},${cy + Math.sin(angles[i]) * r * v}`
  );

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={polyPts(f)} fill="none" stroke="#2a2a2a" strokeWidth="1" />
      ))}
      {/* Axes */}
      {angles.map((a, i) => (
        <line key={i} x1={cx} y1={cy}
          x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r}
          stroke="#333" strokeWidth="1" />
      ))}
      {/* Data polygon */}
      <path d={`M${dataPts.join("L")}Z`}
        fill="rgba(200,220,255,0.15)" stroke="rgba(180,210,255,0.7)" strokeWidth="1.5" />
      {/* Labels: "ATK (62)" */}
      {angles.map((a, i) => {
        const lx = cx + Math.cos(a) * labelR;
        const ly = cy + Math.sin(a) * labelR;
        const val = stats[axes[i].key];
        return (
          <text key={i} x={lx} y={ly}
            textAnchor="middle" dominantBaseline="central"
            fill={axes[i].color} fontSize="8" fontWeight="bold" fontFamily="sans-serif">
            {axes[i].label} ({val})
          </text>
        );
      })}
    </svg>
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

// Single image slot
function ImgSlot({ src, alt, size = 120 }: { src: string | null; alt: string; size?: number }) {
  const cls = `rounded-xl bg-[#111] border border-[#2a2a2a] overflow-hidden flex items-center justify-center flex-shrink-0`;
  const style = { width: size, height: size };
  return (
    <div className={cls} style={style}>
      {src
        ? <img src={src} alt={alt} className="w-full h-full object-contain p-1" /> // eslint-disable-line @next/next/no-img-element
        : <span className="text-[9px] text-gray-700 text-center leading-tight px-1">{alt}</span>
      }
    </div>
  );
}

// Parts label block matching the reference: "BLADE:\nShark Scale\nRACHET:\n3-60\nBIT:\nJolt"
function PartsBlock({ bey }: { bey: DeckBeyInfo }) {
  const cx = isCX(bey.beyLine);
  const rows: { label: string; value: string }[] = cx
    ? [
        ...(bey.lockChip  ? [{ label: "LOCK CHIP:",   value: bey.lockChip }]  : []),
        ...(bey.overBlade ? [{ label: "OVER BLADE:",  value: bey.overBlade }] : []),
        ...(bey.metalBlade ? [{ label: "METAL BLADE:", value: bey.metalBlade }] : []),
        ...(bey.assistBlade ? [{ label: "ASSIST:",     value: bey.assistBlade }] : []),
        ...(bey.ratchet   ? [{ label: "RATCHET:",     value: bey.ratchet }]   : []),
        ...(bey.bit       ? [{ label: "BIT:",         value: bey.bit }]       : []),
      ]
    : [
        ...(bey.blade   ? [{ label: "BLADE:",   value: bey.blade }]   : []),
        ...(bey.ratchet ? [{ label: "RATCHET:", value: bey.ratchet }] : []),
        ...(bey.bit     ? [{ label: "BIT:",     value: bey.bit }]     : []),
      ];

  return (
    <div className="flex flex-col justify-center gap-0.5 min-w-0">
      {rows.map(({ label, value }) => (
        <div key={label}>
          <span className="text-[10px] font-black text-white tracking-wide">{label}</span>
          <br />
          <span className="text-[11px] font-semibold text-gray-300 leading-tight">{value}</span>
        </div>
      ))}
    </div>
  );
}

function BeyCard({ bey, slot }: { bey: DeckBeyInfo; slot: number }) {
  const slotAccents = ["text-[#f0a500]", "text-[#c8102e]", "text-blue-400"];
  const slotBorders = ["border-[#f0a500]/30", "border-[#c8102e]/30", "border-blue-500/30"];
  const cx = isCX(bey.beyLine);
  const hasStats = Object.values(bey.stats).some((v) => v > 0);

  // For CX: show lockChip + (overBlade) + metalBlade images stacked/side-by-side
  // For BX/UX: show single blade image
  const mainImageSize = cx ? 80 : 130;

  return (
    <div className={`bg-[#1c1c1c] border ${slotBorders[slot]} rounded-2xl overflow-hidden`}>
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-[#252525]">
        <span className={`text-[11px] font-black ${slotAccents[slot]} uppercase tracking-widest`}>
          BEY {slot + 1}
        </span>
        {bey.beyLine && (
          <span className="text-[10px] font-bold bg-[#252525] text-gray-400 px-2 py-0.5 rounded">
            {LINE_LABELS[bey.beyLine] ?? bey.beyLine}
          </span>
        )}
        <span className="ml-auto text-xs font-bold text-white truncate">{bey.name}</span>
      </div>

      {/* Body: image(s) | parts | radar */}
      <div className="flex items-center gap-3 p-4">

        {/* Image column */}
        {cx ? (
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <ImgSlot src={bey.lockChipImageUrl} alt={bey.lockChip ?? "Lock"} size={mainImageSize} />
            {bey.overBlade && (
              <ImgSlot src={bey.overBladeImageUrl} alt={bey.overBlade} size={mainImageSize} />
            )}
            <ImgSlot src={bey.metalBladeImageUrl} alt={bey.metalBlade ?? "Metal"} size={mainImageSize} />
          </div>
        ) : (
          <ImgSlot src={bey.bladeImageUrl} alt={bey.blade ?? "Blade"} size={mainImageSize} />
        )}

        {/* Parts block */}
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <PartsBlock bey={bey} />
        </div>

        {/* Radar chart */}
        {hasStats && (
          <div className="flex-shrink-0">
            <RadarChart stats={bey.stats} size={170} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── server component ──────────────────────────────────────────────────────────

export default async function MyDeckSection({ userId }: { userId: string }) {
  const participation = await prisma.tournamentParticipant.findFirst({
    where: { userId, beyblade1: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      beyblade1: true, beyblade2: true, beyblade3: true,
      tournament: { select: { name: true, status: true } },
    },
  });

  if (!participation) return null;

  if (participation.tournament.status === "FINISHED") {
    const active = await prisma.tournamentParticipant.findFirst({
      where: { userId, beyblade1: { not: null }, tournament: { status: { in: ["IN_PROGRESS", "REGISTRATION"] } } },
      orderBy: { createdAt: "desc" },
      select: {
        beyblade1: true, beyblade2: true, beyblade3: true,
        tournament: { select: { name: true, status: true } },
      },
    });
    if (active) Object.assign(participation, active);
  }

  const bIds = [participation.beyblade1, participation.beyblade2, participation.beyblade3].filter(Boolean) as string[];
  if (bIds.length === 0) return null;

  const beyblades = await prisma.beyblade.findMany({ where: { id: { in: bIds } } });
  const beyMap = Object.fromEntries(beyblades.map((b) => [b.id, b]));

  function isCXLine(line: string | null) { return line === "CX" || line === "CX_EXPAND"; }

  const partLookups: { name: string; line: string; category: string }[] = [];
  for (const b of beyblades) {
    const line = b.beyLine ?? "";
    const cxLine = line === "CX_EXPAND" ? "CX_EXPAND" : "CX";
    if (!isCXLine(line)) {
      if (b.blade)   partLookups.push({ name: b.blade,   line,       category: "BLADE" });
      if (b.ratchet) partLookups.push({ name: b.ratchet, line: "RATCHET", category: "RATCHET" });
      if (b.bit)     partLookups.push({ name: b.bit,     line: "BIT",     category: "BIT" });
    } else {
      if (b.lockChip)   { partLookups.push({ name: b.lockChip,   line: "CX",      category: "LOCK_CHIP" });   partLookups.push({ name: b.lockChip,   line: "CX_EXPAND", category: "LOCK_CHIP" }); }
      if (b.metalBlade)  partLookups.push({ name: b.metalBlade,  line: cxLine,    category: "MAIN_BLADE" });
      if (b.assistBlade){ partLookups.push({ name: b.assistBlade, line: "CX",      category: "ASSIST_BLADE" }); partLookups.push({ name: b.assistBlade, line: "CX_EXPAND", category: "ASSIST_BLADE" }); }
      if (b.overBlade)   partLookups.push({ name: b.overBlade,   line: "CX_EXPAND", category: "OVER_BLADE" });
      if (b.ratchet)     partLookups.push({ name: b.ratchet,     line: "RATCHET", category: "RATCHET" });
      if (b.bit)         partLookups.push({ name: b.bit,         line: "BIT",     category: "BIT" });
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

  function toStats(p: typeof foundParts[0] | null): CombinedStats | null {
    if (!p) return null;
    return {
      statAttack: p.statAttack ?? 0, statDefense: p.statDefense ?? 0, statStamina: p.statStamina ?? 0,
      statHeight: p.statHeight ?? 0, statDash: p.statDash ?? 0, statBurst: p.statBurst ?? 0,
    };
  }

  const deckBeys: DeckBeyInfo[] = bIds.map((id) => {
    const b = beyMap[id];
    if (!b) return null;
    const line = b.beyLine ?? "";
    const cxLine = line === "CX_EXPAND" ? "CX_EXPAND" : "CX";
    const cx = isCXLine(line);

    const bladePart     = cx ? null : findPart(b.blade, line, "BLADE");
    const ratchetPart   = findPart(b.ratchet, "RATCHET", "RATCHET");
    const bitPart       = findPart(b.bit, "BIT", "BIT");
    const lockChipPart  = cx ? (findPart(b.lockChip, "CX", "LOCK_CHIP") ?? findPart(b.lockChip, "CX_EXPAND", "LOCK_CHIP")) : null;
    const metalBladePart = cx ? findPart(b.metalBlade, cxLine, "MAIN_BLADE") : null;
    const assistBladePart = cx ? (findPart(b.assistBlade, "CX", "ASSIST_BLADE") ?? findPart(b.assistBlade, "CX_EXPAND", "ASSIST_BLADE")) : null;
    const overBladePart = cx ? findPart(b.overBlade, "CX_EXPAND", "OVER_BLADE") : null;

    const partsForStats = (cx
      ? [metalBladePart, assistBladePart, overBladePart, ratchetPart, bitPart]
      : [bladePart, ratchetPart, bitPart]
    ).map(toStats);

    return {
      id: b.id, name: b.name, beyLine: b.beyLine,
      blade: b.blade, ratchet: b.ratchet, bit: b.bit,
      lockChip: b.lockChip, metalBlade: b.metalBlade, assistBlade: b.assistBlade, overBlade: b.overBlade,
      bladeImageUrl:     bladePart?.imageUrl     ?? null,
      lockChipImageUrl:  lockChipPart?.imageUrl  ?? null,
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

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h2 className="text-lg font-bold text-white">Meu Deck</h2>
        <span className="text-sm text-gray-500">{participation.tournament.name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          participation.tournament.status === "IN_PROGRESS"  ? "bg-green-500/20 text-green-400"
          : participation.tournament.status === "REGISTRATION" ? "bg-[#f0a500]/20 text-[#f0a500]"
          : "bg-gray-700 text-gray-400"
        }`}>
          {statusLabel[participation.tournament.status] ?? participation.tournament.status}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {deckBeys.map((bey, i) => (
          <BeyCard key={bey.id} bey={bey} slot={i} />
        ))}
      </div>
    </div>
  );
}
