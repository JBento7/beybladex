"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <img src="/bey-removebg-preview.png" alt="" className="w-8 h-8 object-contain" />
        <span className="text-2xl font-black text-[#f0a500]">BeybladeX</span>
      </Link>

      <div className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">Redefinir Senha</h1>
        <p className="text-gray-400 text-center mb-8 text-sm">
          Informe seu e-mail para gerar um link de redefinição.
        </p>

        {submitted ? (
          <div className="text-center space-y-4">
            <div aria-live="polite" className="bg-green-900/30 border border-green-700 text-green-400 text-sm px-4 py-4 rounded-lg">
              Se esse e-mail estiver cadastrado, um link de redefinição foi gerado. Peça ao administrador para acessar o painel Admin → Tokens de Redefinição para compartilhar o link com você.
            </div>
            <Link href="/login" className="block text-[#f0a500] hover:text-[#d4940a] text-sm font-medium mt-4">
              ← Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div role="alert" className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">E-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="voce@exemplo.com"
                className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#f0a500] hover:bg-[#d4940a] disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-colors text-base"
            >
              {loading ? "Enviando..." : "Solicitar Redefinição"}
            </button>

            <p className="text-center text-sm text-gray-400">
              <Link href="/login" className="text-[#f0a500] hover:text-[#d4940a] font-medium">
                ← Voltar ao login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
