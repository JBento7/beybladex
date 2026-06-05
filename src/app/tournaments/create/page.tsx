"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Navbar from "@/components/Navbar";

const FORMATS = [
  {
    value: "ROUND_ROBIN",
    label: "Pontos Corridos",
    icon: "🔄",
    desc: "Todos se enfrentam. Top 4 → semifinais → final.",
  },
  {
    value: "GROUPS",
    label: "Grupos",
    icon: "👥",
    desc: "Jogadores divididos em grupos, os 2 melhores avançam.",
  },
  {
    value: "SINGLE_ELIMINATION",
    label: "Eliminação Simples",
    icon: "⚔️",
    desc: "Perdeu, saiu. Formato de chaveamento.",
  },
];

export default function CreateTournamentPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [form, setForm] = useState({
    name: "",
    description: "",
    format: "ROUND_ROBIN",
    deckType: "SOLO",
    maxParticipants: "",
    startDate: "",
    prize: "",
    arenas: "1",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unofficialNotice, setUnofficialNotice] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || undefined,
        format: form.format,
        deckType: form.deckType,
        maxParticipants: form.maxParticipants
          ? parseInt(form.maxParticipants)
          : undefined,
        startDate: form.startDate || undefined,
        prize: form.prize || undefined,
        arenas: form.arenas ? parseInt(form.arenas) : 1,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Erro ao criar torneio");
      return;
    }

    const tournament = await res.json();
    if (session?.user.role !== "ORGANIZER") {
      setUnofficialNotice(tournament.id);
      return;
    }
    router.push(`/tournaments/${tournament.id}`);
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">Criar Torneio</h1>
          <p className="text-gray-400 mt-1">Configure um novo campeonato de Beyblade</p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {unofficialNotice && (
          <div className="bg-yellow-900/30 border border-yellow-600/50 text-yellow-300 px-4 py-4 rounded-lg mb-6 text-sm">
            <p className="font-bold mb-1">Torneio criado com sucesso!</p>
            <p className="mb-3">Seu torneio foi criado como <strong>NÃO OFICIAL</strong>. Apenas as estatísticas dos beyblades serão contabilizadas. Pontos não contam no ranking da comunidade.</p>
            <button
              onClick={() => router.push(`/tournaments/${unofficialNotice}`)}
              className="bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Ver Torneio →
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Tournament Name */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-base font-bold text-white mb-4">Informações Básicas</h2>
            <div className="space-y-4">
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
                  placeholder="ex: Campeonato Primavera 2025"
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Descrição <span className="text-gray-500 font-normal">(opcional)</span>
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Descreva seu torneio..."
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors resize-none"
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
                  placeholder="ex: R$ 200,00 + Troféu"
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                    className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
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
                    className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                  />
                  <p className="text-xs text-gray-500 mt-1">Partidas divididas por arena automaticamente</p>
                </div>
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
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Deck Type */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-base font-bold text-white mb-4">Tipo de Deck <span className="text-red-400">*</span></h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  value: "SOLO",
                  label: "Solo",
                  icon: null,
                  desc: "Cada jogador usa 1 Beyblade.",
                },
                {
                  value: "THREE_ON_THREE",
                  label: "3 contra 3",
                  icon: "⚡",
                  desc: "Cada jogador usa um deck de 3 Beyblades.",
                },
              ].map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setForm({ ...form, deckType: d.value })}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    form.deckType === d.value
                      ? "border-[#c8102e] bg-[#c8102e]/10"
                      : "border-[#333] bg-[#252525] hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {d.icon ? <span className="text-xl">{d.icon}</span> : <img src="/bey-removebg-preview.png" alt="" className="w-5 h-5 object-contain" />}
                    <span className={`font-semibold text-sm ${form.deckType === d.value ? "text-[#c8102e]" : "text-white"}`}>
                      {d.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Format Selection */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-base font-bold text-white mb-4">Formato do Torneio <span className="text-red-400">*</span></h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setForm({ ...form, format: f.value })}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    form.format === f.value
                      ? "border-[#f0a500] bg-[#f0a500]/10"
                      : "border-[#333] bg-[#252525] hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{f.icon}</span>
                    <span className={`font-semibold text-sm ${form.format === f.value ? "text-[#f0a500]" : "text-white"}`}>
                      {f.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#c8102e] hover:bg-[#a00d24] disabled:opacity-60 text-white font-black text-lg py-3.5 rounded-xl transition-colors"
          >
            {loading ? "Criando..." : "🏆 Criar Torneio"}
          </button>
        </form>
      </main>
    </div>
  );
}
