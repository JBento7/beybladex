"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("E-mail ou senha inválidos.");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-8">
        <span className="text-3xl">🌀</span>
        <span className="text-2xl font-black text-amber-400">BeybladeX</span>
      </Link>

      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">Bem-vindo de volta</h1>
        <p className="text-gray-400 text-center mb-8 text-sm">Entre na sua conta do campeonato</p>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="voce@exemplo.com"
              className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-300">
                Senha
              </label>
              <Link href="/forgot-password" className="text-xs text-gray-500 hover:text-gray-400 transition-colors">
                Esqueceu sua senha?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-colors text-base"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          Não tem uma conta?{" "}
          <Link href="/register" className="text-amber-400 hover:text-amber-300 font-medium">
            Cadastre-se aqui
          </Link>
        </p>
      </div>
    </div>
  );
}
