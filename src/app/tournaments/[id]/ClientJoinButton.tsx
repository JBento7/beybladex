"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClientJoinButton({
  tournamentId,
  deckType = "SOLO",
}: {
  tournamentId: string;
  deckType?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [beyblade1, setBeyblade1] = useState("");
  const [beyblade2, setBeyblade2] = useState("");
  const [beyblade3, setBeyblade3] = useState("");
  const router = useRouter();

  async function handleJoin() {
    if (deckType === "THREE_ON_THREE" && (!beyblade1 || !beyblade2 || !beyblade3)) {
      alert("Preencha os nomes das 3 Beyblades.");
      return;
    }
    if (deckType === "SOLO" && !beyblade1) {
      alert("Preencha o nome da sua Beyblade.");
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beyblade1, beyblade2, beyblade3 }),
    });
    setLoading(false);

    if (res.ok) {
      setShowModal(false);
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "Erro ao se inscrever no torneio");
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2.5 rounded-xl transition-colors"
      >
        Participar do Torneio
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">Inscrição no Torneio</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Nome da Beyblade {deckType === "THREE_ON_THREE" ? "1" : ""} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={beyblade1}
                  onChange={(e) => setBeyblade1(e.target.value)}
                  placeholder="ex: Dragoon Storm"
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              {deckType === "THREE_ON_THREE" && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Nome da Beyblade 2 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={beyblade2}
                      onChange={(e) => setBeyblade2(e.target.value)}
                      placeholder="ex: Dranzer Spiral"
                      className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Nome da Beyblade 3 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={beyblade3}
                      onChange={(e) => setBeyblade3(e.target.value)}
                      placeholder="ex: Driger S"
                      className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-2.5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleJoin}
                disabled={loading}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold py-2.5 rounded-xl transition-colors"
              >
                {loading ? "Inscrevendo..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
