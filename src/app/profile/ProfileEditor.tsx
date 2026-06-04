"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ProfileEditorProps {
  initialName: string;
  initialEmail: string;
  initialBladerName: string;
}

export default function ProfileEditor({ initialName, initialEmail, initialBladerName }: ProfileEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [bladerName, setBladerName] = useState(initialBladerName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Nome não pode ser vazio.");
      return;
    }

    if (newPassword && !currentPassword) {
      setError("Informe sua senha atual para alterá-la.");
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setError("As novas senhas não coincidem.");
      return;
    }

    const body: Record<string, string> = { name: name.trim(), email: email.trim(), bladerName: bladerName.trim() };
    if (newPassword) {
      body.currentPassword = currentPassword;
      body.newPassword = newPassword;
    }

    setLoading(true);
    const res = await fetch("/api/profile/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok || data.error) {
      setError(data.error || "Erro ao salvar.");
    } else {
      setSuccess("Perfil atualizado com sucesso!");
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(""), 4000);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="flex-1">
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <div>
          <span className="text-2xl font-black text-white">{initialBladerName || initialName}</span>
          {initialBladerName && <span className="text-sm text-gray-500 ml-2">{initialName}</span>}
        </div>
        <button
          onClick={() => { setOpen(!open); setError(""); setSuccess(""); }}
          className="text-xs px-3 py-1 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded-lg transition-colors border border-[#3a3a3a]"
        >
          Editar Perfil
        </button>
      </div>
      <p className="text-gray-400 text-sm">{initialEmail}</p>

      {success && !open && (
        <p className="text-green-400 text-sm mt-2">{success}</p>
      )}

      {open && (
        <form onSubmit={handleSave} className="mt-4 space-y-4 max-w-sm">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Nome Blader <span className="text-[#f0a500] text-xs font-normal">(aparece nos torneios)</span>
            </label>
            <input
              type="text"
              value={bladerName}
              onChange={(e) => setBladerName(e.target.value)}
              placeholder="ex: DranSlayer, VoltKing..."
              className="w-full bg-gray-800 border border-gray-700 focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-700 focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-700 focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
            />
          </div>

          <div className="pt-2">
            <div className="border-t border-[#2a2a2a] pt-4">
              <p className="text-sm text-gray-500 mb-3 font-medium">Alterar Senha (opcional)</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Senha atual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nova senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Confirmar nova senha</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="bg-[#f0a500] hover:bg-[#d4940a] disabled:opacity-60 text-black font-bold px-5 py-2 rounded-lg transition-colors text-sm"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(""); setName(initialName); setEmail(initialEmail); setBladerName(initialBladerName); }}
              className="bg-[#2a2a2a] hover:bg-[#333] text-gray-300 px-5 py-2 rounded-lg transition-colors text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
