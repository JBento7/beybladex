"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FORMATS = [
  { value: "ROUND_ROBIN", label: "Suíço" },
  { value: "GROUPS", label: "Grupos" },
  { value: "SINGLE_ELIMINATION", label: "Eliminação Simples" },
];

const DECK_TYPES = [
  { value: "SOLO", label: "Solo" },
  { value: "THREE_ON_THREE", label: "3 vs 3" },
];

export default function AdminPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    format: "ROUND_ROBIN",
    deckType: "SOLO",
    maxParticipants: "",
    startDate: "",
    prize: "",
    arenas: "1",
    eventType: "TORNEIO",
  });
  const [dateTBD, setDateTBD] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || undefined,
        format: form.format,
        deckType: form.deckType,
        maxParticipants: form.maxParticipants ? parseInt(form.maxParticipants) : undefined,
        startDate: dateTBD ? undefined : form.startDate || undefined,
        prize: form.prize || undefined,
        arenas: form.arenas ? parseInt(form.arenas) : 1,
        eventType: form.eventType,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Erro ao criar torneio");
      return;
    }

    const tournament = await res.json();
    setOpen(false);
    setForm({ name: "", description: "", format: "ROUND_ROBIN", deckType: "SOLO", maxParticipants: "", startDate: "", prize: "", arenas: "1", eventType: "TORNEIO" });
    setDateTBD(false);
    router.push(`/tournaments/${tournament.id}`);
  }

  async function generateInvite() {
    const res = await fetch("/api/invites", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      const link = `${window.location.origin}/register?invite=${data.token}`;
      setInviteLink(link);
    }
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#c8102e]/30 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-bold text-white">Criar Torneio Oficial</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={generateInvite}
            className="bg-[#252525] hover:bg-[#303030] border border-[#333] text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            🔗 Gerar Link de Convite
          </button>
          <button
            onClick={() => setOpen(!open)}
            className="bg-[#c8102e] hover:bg-[#a00d24] text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
          >
            {open ? "Cancelar" : "+ Novo Torneio Oficial"}
          </button>
        </div>
      </div>

      {inviteLink && (
        <div className="mb-4 bg-[#f0a500]/10 border border-[#f0a500]/30 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Link de convite gerado:</div>
          <div className="flex items-center gap-2">
            <code className="text-[#f0a500] text-xs flex-1 break-all">{inviteLink}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(inviteLink); }}
              className="text-xs bg-[#f0a500] text-black font-bold px-2 py-1 rounded flex-shrink-0"
            >
              Copiar
            </button>
          </div>
        </div>
      )}

      {open && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-700/30 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Event type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Tipo de Evento</label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: "TORNEIO", label: "🏆 Torneio", desc: "Pontos contam no ranking." },
                { value: "BEYENCONTRO", label: "🎮 BeyEncontro", desc: "Encontro casual, sem ranking." },
              ] as const).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm({ ...form, eventType: t.value })}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    form.eventType === t.value
                      ? t.value === "TORNEIO"
                        ? "border-[#f0a500] bg-[#f0a500]/10"
                        : "border-blue-500 bg-blue-500/10"
                      : "border-[#333] bg-[#252525] hover:border-gray-600"
                  }`}
                >
                  <div className={`font-semibold text-sm mb-0.5 ${
                    form.eventType === t.value
                      ? t.value === "TORNEIO" ? "text-[#f0a500]" : "text-blue-400"
                      : "text-white"
                  }`}>{t.label}</div>
                  <div className="text-xs text-gray-500">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Nome do Torneio <span className="text-red-400">*</span>
              </label>
              <input
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="ex: LBL Open 2025"
                className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Prêmio <span className="text-gray-500 font-normal">(opcional)</span>
              </label>
              <input
                name="prize"
                type="text"
                value={form.prize}
                onChange={handleChange}
                placeholder="ex: R$ 500,00 + Troféu"
                className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Descrição <span className="text-gray-500 font-normal">(opcional)</span>
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={2}
              placeholder="Descreva o torneio oficial..."
              className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors resize-none"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Formato <span className="text-red-400">*</span>
              </label>
              <select
                name="format"
                value={form.format}
                onChange={handleChange}
                className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Tipo de Deck</label>
              <select
                name="deckType"
                value={form.deckType}
                onChange={handleChange}
                className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
              >
                {DECK_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Máx. Participantes <span className="text-gray-500 font-normal">(opcional)</span>
              </label>
              <input
                name="maxParticipants"
                type="number"
                min="2"
                max="256"
                value={form.maxParticipants}
                onChange={handleChange}
                placeholder="Ilimitado"
                className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Nº de Arenas
              </label>
              <input
                name="arenas"
                type="number"
                min="1"
                max="20"
                value={form.arenas}
                onChange={handleChange}
                placeholder="1"
                className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Data de Início <span className="text-gray-500 font-normal">(opcional)</span>
              </label>
              <input
                name="startDate"
                type="datetime-local"
                value={form.startDate}
                onChange={handleChange}
                disabled={dateTBD}
                className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors disabled:opacity-50"
              />
              <label className="flex items-center gap-2 mt-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dateTBD}
                  onChange={(e) => {
                    setDateTBD(e.target.checked);
                    if (e.target.checked) setForm({ ...form, startDate: "" });
                  }}
                  className="accent-[#f0a500]"
                />
                Data a definir
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#c8102e] hover:bg-[#a00d24] disabled:opacity-60 text-white font-black text-base py-3 rounded-xl transition-colors"
          >
            {loading ? "Criando..." : "🏆 Criar Torneio Oficial"}
          </button>
        </form>
      )}

      {!open && !inviteLink && (
        <p className="text-gray-500 text-sm">
          Crie torneios oficiais da LBL com configurações avançadas, defina prêmios e gere links de convite para novos organizadores.
        </p>
      )}
    </div>
  );
}
