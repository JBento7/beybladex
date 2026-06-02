"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

const FORMATS = [
  {
    value: "ROUND_ROBIN",
    label: "Pontos Corridos",
    icon: "🔄",
    desc: "Todos os jogadores se enfrentam uma vez.",
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
  {
    value: "SWISS",
    label: "Suíço",
    icon: "🇨🇭",
    desc: "Sem eliminação, jogadores emparelhados por desempenho.",
  },
];

export default function CreateTournamentPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    description: "",
    format: "ROUND_ROBIN",
    maxParticipants: "",
    startDate: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        maxParticipants: form.maxParticipants
          ? parseInt(form.maxParticipants)
          : undefined,
        startDate: form.startDate || undefined,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Erro ao criar torneio");
      return;
    }

    const tournament = await res.json();
    router.push(`/tournaments/${tournament.id}`);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
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

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Tournament Name */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
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
                  className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
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
                  className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors resize-none"
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
                    className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
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
                    className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Format Selection */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-base font-bold text-white mb-4">Formato do Torneio <span className="text-red-400">*</span></h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setForm({ ...form, format: f.value })}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    form.format === f.value
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-gray-700 bg-gray-800 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{f.icon}</span>
                    <span className={`font-semibold text-sm ${form.format === f.value ? "text-amber-400" : "text-white"}`}>
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
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-black text-lg py-3.5 rounded-xl transition-colors"
          >
            {loading ? "Criando..." : "🏆 Criar Torneio"}
          </button>
        </form>
      </main>
    </div>
  );
}
