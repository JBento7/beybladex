"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Navbar from "@/components/Navbar";

const FORMATS = [
  {
    value: "ROUND_ROBIN",
    label: "Suíço",
    icon: "🔄",
    desc: "Todos se enfrentam na fase inicial; os melhores avançam para o mata-mata.",
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
  const isAdmin = session?.user.role === "ORGANIZER";
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
    setsToWin: "2",
    pointsToWinSet: "4",
    qualifiers: "8",
    bannerUrl: "",
    location: "",
    venueName: "",
    address: "",
    entryFee: "",
    regulation: "",
    registrationDeadline: "",
  });
  const [isTest, setIsTest] = useState(false);
  const [dateTBD, setDateTBD] = useState(false);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [day2Date, setDay2Date] = useState("");
  const [day2SetsToWin, setDay2SetsToWin] = useState("2");
  const [day2PointsToWinSet, setDay2PointsToWinSet] = useState("4");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
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
        startDate: dateTBD ? undefined : form.startDate || undefined,
        prize: form.prize || undefined,
        arenas: form.arenas ? parseInt(form.arenas) : 1,
        eventType: isAdmin ? form.eventType : "BEYENCONTRO",
        isTest: isAdmin ? isTest : false,
        setsToWin: form.setsToWin,
        pointsToWinSet: form.pointsToWinSet,
        qualifiers: form.format === "ROUND_ROBIN" ? parseInt(form.qualifiers) : undefined,
        isMultiDay: form.format === "ROUND_ROBIN" && isMultiDay,
        day2Date: form.format === "ROUND_ROBIN" && isMultiDay && !dateTBD ? day2Date || undefined : undefined,
        day2SetsToWin: form.format === "ROUND_ROBIN" && isMultiDay ? day2SetsToWin : undefined,
        day2PointsToWinSet: form.format === "ROUND_ROBIN" && isMultiDay ? day2PointsToWinSet : undefined,
        bannerUrl: form.bannerUrl || undefined,
        location: form.location || undefined,
        venueName: form.venueName || undefined,
        address: form.address || undefined,
        entryFee: form.entryFee ? parseFloat(form.entryFee) : undefined,
        regulation: form.regulation || undefined,
        registrationDeadline: form.registrationDeadline || undefined,
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

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Event Type — admin chooses, player sees fixed notice */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-base font-bold text-white mb-4">Tipo de Evento <span className="text-red-400">*</span></h2>
            {isAdmin ? (
              <div className="grid grid-cols-2 gap-3">
                {([
                  {
                    value: "TORNEIO",
                    label: "Torneio",
                    icon: "🏆",
                    desc: "Partidas oficiais. Pontos contam no ranking da comunidade.",
                    border: "border-[#f0a500]",
                    bg: "bg-[#f0a500]/10",
                    text: "text-[#f0a500]",
                  },
                  {
                    value: "BEYENCONTRO",
                    label: "BeyEncontro",
                    icon: "🎮",
                    desc: "Encontro casual para treino e diversão. Sem pontos de ranking.",
                    border: "border-blue-500",
                    bg: "bg-blue-500/10",
                    text: "text-blue-400",
                  },
                ] as const).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm({ ...form, eventType: t.value })}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      form.eventType === t.value
                        ? `${t.border} ${t.bg}`
                        : "border-[#333] bg-[#252525] hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{t.icon}</span>
                      <span className={`font-bold text-sm ${form.eventType === t.value ? t.text : "text-white"}`}>
                        {t.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">{t.desc}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <span className="text-2xl">🎮</span>
                <div>
                  <p className="font-bold text-blue-400 text-sm">BeyEncontro</p>
                  <p className="text-xs text-gray-400 mt-0.5">Seus eventos são criados como BeyEncontro — estatísticas de beyblade são registradas, mas pontos não contam no ranking da comunidade.</p>
                </div>
              </div>
            )}

            {isAdmin && (
              <label className="flex items-start gap-3 mt-4 bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTest}
                  onChange={(e) => setIsTest(e.target.checked)}
                  className="accent-purple-500 mt-0.5"
                />
                <div>
                  <p className="font-bold text-purple-400 text-sm">🧪 Torneio de Teste</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Não aparece na lista pública de torneios — fica disponível apenas em
                    &quot;Teste Torneios&quot;, visível só para admins.
                  </p>
                </div>
              </label>
            )}
          </div>

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
                  placeholder="ex: Campeonato Primavera"
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
                  disabled={dateTBD}
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors disabled:opacity-50"
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
          </div>

          {/* Location & Registration */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-base font-bold text-white mb-4">Local & Inscrição</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Imagem/Banner <span className="text-gray-500 font-normal">(URL, opcional)</span>
                </label>
                <input
                  name="bannerUrl"
                  type="text"
                  value={form.bannerUrl}
                  onChange={handleChange}
                  placeholder="https://..."
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Cidade/Estado <span className="text-gray-500 font-normal">(opcional)</span>
                  </label>
                  <input
                    name="location"
                    type="text"
                    value={form.location}
                    onChange={handleChange}
                    placeholder="ex: Recife, PE"
                    className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Taxa de Inscrição <span className="text-gray-500 font-normal">(R$, opcional)</span>
                  </label>
                  <input
                    name="entryFee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.entryFee}
                    onChange={handleChange}
                    placeholder="0,00"
                    className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Nome do Local/Arena <span className="text-gray-500 font-normal">(opcional)</span>
                </label>
                <input
                  name="venueName"
                  type="text"
                  value={form.venueName}
                  onChange={handleChange}
                  placeholder="ex: HiraBistro"
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Endereço Completo <span className="text-gray-500 font-normal">(opcional)</span>
                </label>
                <input
                  name="address"
                  type="text"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="ex: Av. Mal. Mascarenhas de Morais, 4989"
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Prazo de Inscrição <span className="text-gray-500 font-normal">(opcional)</span>
                </label>
                <input
                  name="registrationDeadline"
                  type="datetime-local"
                  value={form.registrationDeadline}
                  onChange={handleChange}
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Regulamento <span className="text-gray-500 font-normal">(opcional)</span>
                </label>
                <textarea
                  name="regulation"
                  value={form.regulation}
                  onChange={handleChange}
                  rows={3}
                  placeholder="ex: Formato 3on3. Somente peças originais. Regras oficiais."
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors resize-none"
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

            {form.format === "ROUND_ROBIN" && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Quantos jogadores avançam para o mata-mata
                </label>
                <select
                  name="qualifiers"
                  value={form.qualifiers}
                  onChange={handleChange}
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
                >
                  <option value="16">16 jogadores</option>
                  <option value="8">8 jogadores</option>
                  <option value="4">4 jogadores</option>
                </select>
                <p className="text-xs text-gray-500 mt-1.5">
                  Os melhores colocados da fase inicial passam para o chaveamento eliminatório. Se houver menos inscritos que o número escolhido, não há mata-mata.
                </p>

                {/* Two-day tournament */}
                <div className="mt-4 border-t border-[#2a2a2a] pt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isMultiDay}
                      onChange={(e) => setIsMultiDay(e.target.checked)}
                      className="w-4 h-4 accent-[#f0a500]"
                    />
                    <span className="text-sm font-medium text-gray-200">Torneio de 2 dias (Dia 1: Suíço · Dia 2: Mata-mata)</span>
                  </label>
                  {isMultiDay && (
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Dia 1 — Fase Suíça</label>
                        <input
                          type="date"
                          name="startDate"
                          value={form.startDate}
                          onChange={handleChange}
                          disabled={dateTBD}
                          className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors disabled:opacity-40"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Dia 2 — Mata-mata</label>
                        <input
                          type="date"
                          value={day2Date}
                          onChange={(e) => setDay2Date(e.target.value)}
                          disabled={dateTBD}
                          className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors disabled:opacity-40"
                        />
                      </div>
                      <p className="col-span-2 text-xs text-gray-500">
                        No dia 1 acontece a fase suíça. Quando a última rodada suíça termina, o chaveamento com os {form.qualifiers} classificados é gerado automaticamente para o dia 2.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Match Rules */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-base font-bold text-white mb-4">Regras da Partida</h2>
            {isMultiDay && form.format === "ROUND_ROBIN" && (
              <div className="text-xs font-bold text-[#f0a500] mb-2">Dia 1 — Fase Suíça</div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Sets por partida
                </label>
                <select
                  name="setsToWin"
                  value={form.setsToWin}
                  onChange={handleChange}
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
                >
                  <option value="1">1 set</option>
                  <option value="2">Melhor de 3 (2 sets)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Pontos para vencer o set
                </label>
                <select
                  name="pointsToWinSet"
                  value={form.pointsToWinSet}
                  onChange={handleChange}
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
                >
                  <option value="4">4 pontos</option>
                  <option value="5">5 pontos</option>
                  <option value="6">6 pontos</option>
                  <option value="7">7 pontos</option>
                </select>
              </div>
            </div>

            {/* Day 2 (knockout) rules, only for 2-day Suíço */}
            {isMultiDay && form.format === "ROUND_ROBIN" && (
              <div className="mt-5 border-t border-[#2a2a2a] pt-4">
                <div className="text-xs font-bold text-[#f0a500] mb-2">Dia 2 — Mata-mata</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Sets por partida</label>
                    <select
                      value={day2SetsToWin}
                      onChange={(e) => setDay2SetsToWin(e.target.value)}
                      className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
                    >
                      <option value="1">1 set</option>
                      <option value="2">Melhor de 3 (2 sets)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Pontos para vencer o set</label>
                    <select
                      value={day2PointsToWinSet}
                      onChange={(e) => setDay2PointsToWinSet(e.target.value)}
                      className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
                    >
                      <option value="4">4 pontos</option>
                      <option value="5">5 pontos</option>
                      <option value="6">6 pontos</option>
                      <option value="7">7 pontos</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
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
