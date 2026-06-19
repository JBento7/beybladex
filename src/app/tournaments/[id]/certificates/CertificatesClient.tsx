"use client";

import { useState, useRef } from "react";

interface BeybladeInfo {
  id: string;
  name: string;
  blade: string | null;
  ratchet: string | null;
  bit: string | null;
}

interface PlacementData {
  placement: number;
  playerName: string;
  avatarUrl: string | null;
  beyblades: BeybladeInfo[];
}

const PLACEMENT_CONFIG = [
  { label: "CAMPEÃO",  stars: 1, color: "#c8102e" },
  { label: "LUGAR",    stars: 2, color: "#8b1a1a" },
  { label: "LUGAR",    stars: 3, color: "#8b1a1a" },
  { label: "LUGAR",    stars: 4, color: "#8b1a1a" },
  { label: "LUGAR",    stars: 5, color: "#8b1a1a" },
];

const BEY_BOX_COLORS = ["#8b0000", "#1a1a1a", "#3a3a3a"];

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex gap-1 mb-1">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill="#8b1a1a">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

function LaurelSVG() {
  return (
    <svg viewBox="0 0 200 300" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full opacity-20" fill="none">
      <g stroke="#a07820" strokeWidth="1.5" fill="none">
        {/* Left branch */}
        <path d="M80 280 Q60 240 50 200 Q45 160 55 130" />
        <ellipse cx="52" cy="255" rx="10" ry="16" transform="rotate(-30 52 255)" />
        <ellipse cx="45" cy="225" rx="10" ry="16" transform="rotate(-45 45 225)" />
        <ellipse cx="43" cy="193" rx="10" ry="16" transform="rotate(-55 43 193)" />
        <ellipse cx="48" cy="163" rx="9" ry="14" transform="rotate(-60 48 163)" />
        <ellipse cx="57" cy="138" rx="8" ry="13" transform="rotate(-65 57 138)" />
        {/* Right branch */}
        <path d="M120 280 Q140 240 150 200 Q155 160 145 130" />
        <ellipse cx="148" cy="255" rx="10" ry="16" transform="rotate(30 148 255)" />
        <ellipse cx="155" cy="225" rx="10" ry="16" transform="rotate(45 155 225)" />
        <ellipse cx="157" cy="193" rx="10" ry="16" transform="rotate(55 157 193)" />
        <ellipse cx="152" cy="163" rx="9" ry="14" transform="rotate(60 152 163)" />
        <ellipse cx="143" cy="138" rx="8" ry="13" transform="rotate(65 143 138)" />
        {/* Center stem */}
        <path d="M100 280 L100 120" />
      </g>
    </svg>
  );
}

function CertificateCard({
  data,
  photoUrl,
  onPhotoChange,
}: {
  data: PlacementData;
  photoUrl: string | null;
  onPhotoChange: (url: string | null) => void;
}) {
  const cfg = PLACEMENT_CONFIG[data.placement - 1];
  const fileRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onPhotoChange(ev.target?.result as string);
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `${data.placement}lugar-${data.playerName.replace(/\s+/g, "-")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error(e);
    }
    setDownloading(false);
  }

  const displayPhoto = photoUrl || data.avatarUrl;
  const beySlots = [0, 1, 2].map((i) => data.beyblades[i] ?? null);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Card */}
      <div
        ref={cardRef}
        style={{
          width: 480,
          height: 560,
          background: "#f5f0e8",
          borderRadius: 12,
          border: "3px solid #c8102e",
          outline: "2px solid #f0a500",
          outlineOffset: 3,
          position: "relative",
          overflow: "hidden",
          fontFamily: "Impact, 'Arial Black', sans-serif",
        }}
      >
        {/* Top decorative bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 56, background: "#f5f0e8", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
          {/* Left decoration */}
          <div style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,6px)", gap: 2 }}>
              {[...Array(4)].map((_, i) => <div key={i} style={{ width: 5, height: 5, background: i % 2 === 0 ? "#1a1a1a" : "#c8102e", borderRadius: 1 }} />)}
            </div>
            <div style={{ width: 40, height: 3, background: "#f0a500", marginLeft: 4 }} />
            <div style={{ width: 0, height: 0, borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderLeft: "12px solid #f0a500" }} />
          </div>
          {/* Logo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lblnovo.png" alt="LBL" style={{ height: 52, objectFit: "contain" }} />
          {/* Right decoration (mirror) */}
          <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 4, flexDirection: "row-reverse" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,6px)", gap: 2 }}>
              {[...Array(4)].map((_, i) => <div key={i} style={{ width: 5, height: 5, background: i % 2 === 0 ? "#c8102e" : "#f0a500", borderRadius: 1 }} />)}
            </div>
            <div style={{ width: 40, height: 3, background: "#c8102e", marginRight: 4 }} />
            <div style={{ width: 0, height: 0, borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderRight: "12px solid #c8102e" }} />
          </div>
        </div>

        {/* Main body */}
        <div style={{ position: "absolute", top: 56, left: 0, right: 0, bottom: 40, display: "flex" }}>
          {/* Left vertical label */}
          <div style={{
            width: 36, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ color: "#f0a500", fontSize: 11, fontWeight: 900, letterSpacing: 3, transform: "rotate(-90deg)", whiteSpace: "nowrap", textTransform: "uppercase" }}>
              CAMPEONATO LBL
            </span>
          </div>

          {/* Gold diagonal section */}
          <div style={{
            flex: "0 0 56%",
            background: "#d4920a",
            clipPath: "polygon(0 0, 100% 0, 82% 100%, 0 100%)",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Laurel watermark */}
            <LaurelSVG />

            {/* Position + label */}
            <div style={{ position: "relative", zIndex: 2, padding: "14px 14px 8px 14px" }}>
              <StarRow count={data.placement} />
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, lineHeight: 1 }}>
                <span style={{ fontSize: 64, fontWeight: 900, color: "white", textShadow: "2px 2px 0 rgba(0,0,0,0.3)", lineHeight: 1 }}>
                  {data.placement}º
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "white", textShadow: "2px 2px 0 rgba(0,0,0,0.3)", letterSpacing: 2, marginTop: -4 }}>
                {cfg.label}
              </div>
              <div style={{ height: 3, background: "#8b1a1a", marginTop: 6, width: "75%" }} />
            </div>

            {/* Participant photo */}
            <div style={{ position: "relative", zIndex: 2, padding: "0 14px", marginTop: 8 }}>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  width: "78%", aspectRatio: "3/4", background: displayPhoto ? "transparent" : "#b8810a",
                  border: "2px dashed rgba(255,255,255,0.3)", borderRadius: 8, overflow: "hidden",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {displayPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={displayPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, textAlign: "center", fontFamily: "sans-serif", fontWeight: 600 }}>
                    Clique para<br />adicionar foto
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right colored boxes */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: 6, gap: 4 }}>
            {beySlots.map((bey, i) => (
              <div key={i} style={{
                flex: 1, background: BEY_BOX_COLORS[i], borderRadius: 6, overflow: "hidden",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 8,
              }}>
                {bey ? (
                  <>
                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, fontFamily: "sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                      {i === 0 ? "Beyblade" : i === 1 ? "2º Combo" : "3º Combo"}
                    </span>
                    <span style={{ color: "white", fontSize: 13, fontWeight: 900, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {bey.name}
                    </span>
                    {(bey.blade || bey.ratchet || bey.bit) && (
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, fontFamily: "sans-serif", marginTop: 3, textAlign: "center" }}>
                        {[bey.blade, bey.ratchet, bey.bit].filter(Boolean).join(" / ")}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10, fontFamily: "sans-serif" }}>—</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: player name */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 40,
          background: "white", borderTop: "2px solid #f0a500",
          display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px",
        }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: "#1a1a1a", letterSpacing: 1, textTransform: "uppercase" }}>
            {data.playerName}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/liga.png" alt="LBL" style={{ height: 28, objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
      </div>

      {/* Controls below card */}
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="px-4 py-2 bg-[#252525] hover:bg-[#333] text-gray-300 text-sm font-semibold rounded-lg transition-colors"
        >
          📷 Foto do participante
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="px-4 py-2 bg-[#f0a500] hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-bold rounded-lg transition-colors"
        >
          {downloading ? "Gerando..." : "⬇ Baixar PNG"}
        </button>
        {photoUrl && (
          <button
            onClick={() => onPhotoChange(null)}
            className="px-3 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 text-sm font-semibold rounded-lg transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
    </div>
  );
}

export default function CertificatesClient({
  placements,
  tournamentName,
}: {
  placements: PlacementData[];
  tournamentName: string;
}) {
  const [photos, setPhotos] = useState<Record<number, string | null>>({});
  const [activeIdx, setActiveIdx] = useState(0);

  const all = [1, 2, 3, 4, 5].map((pos) => {
    const found = placements.find((p) => p.placement === pos);
    return found ?? {
      placement: pos,
      playerName: "—",
      avatarUrl: null,
      beyblades: [],
    };
  });

  return (
    <div>
      {/* Placement selector tabs */}
      <div className="flex gap-2 mb-6">
        {all.map((p, i) => (
          <button
            key={p.placement}
            onClick={() => setActiveIdx(i)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              activeIdx === i ? "bg-[#f0a500] text-black" : "bg-[#252525] text-gray-400 hover:text-white"
            }`}
          >
            {p.placement === 1 ? "🥇 Campeão" : `${p.placement}º Lugar`}
          </button>
        ))}
      </div>

      {/* Active card */}
      <div className="flex flex-col items-center">
        <CertificateCard
          key={all[activeIdx].placement}
          data={all[activeIdx]}
          photoUrl={photos[all[activeIdx].placement] ?? null}
          onPhotoChange={(url) =>
            setPhotos((prev) => ({ ...prev, [all[activeIdx].placement]: url }))
          }
        />
      </div>

      {placements.length === 0 && (
        <p className="text-center text-gray-500 text-sm mt-8">
          Nenhum participante com colocação registrada. Finalize o torneio para gerar os cards.
        </p>
      )}
    </div>
  );
}
