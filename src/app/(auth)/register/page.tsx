"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    beyblade: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [inviteChecking, setInviteChecking] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    setInviteChecking(true);
    fetch(`/api/invites/${inviteToken}`)
      .then((r) => r.json())
      .then((data) => {
        setInviteValid(data.valid === true);
        setInviteChecking(false);
      })
      .catch(() => {
        setInviteValid(false);
        setInviteChecking(false);
      });
  }, [inviteToken]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    if (form.password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (inviteToken && inviteValid === false) {
      setError("Convite inválido ou expirado.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        password: form.password,
        inviteToken: inviteToken || undefined,
        beyblade: form.beyblade || undefined,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Erro ao criar conta.");
      return;
    }

    router.push("/login?registered=1");
  }

  const isOrganizer = inviteToken && inviteValid === true;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <img src="/bey-removebg-preview.png" alt="" className="w-8 h-8 object-contain" />
        <span className="text-2xl font-black text-amber-400">BeybladeX</span>
      </Link>

      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">Criar Conta</h1>
        <p className="text-gray-400 text-center mb-4 text-sm">
          {isOrganizer
            ? "Você foi convidado para se tornar um Organizador!"
            : "Junte-se à comunidade de campeonatos Beyblade"}
        </p>

        {inviteToken && (
          <div className={`text-xs px-3 py-2 rounded-lg mb-4 text-center font-medium ${
            inviteChecking
              ? "bg-gray-800 text-gray-400"
              : inviteValid
              ? "bg-amber-500/10 border border-amber-500/30 text-amber-400"
              : "bg-red-900/30 border border-red-700 text-red-400"
          }`}>
            {inviteChecking
              ? "Verificando convite..."
              : inviteValid
              ? "👑 Convite válido — você será cadastrado como Organizador"
              : "⚠️ Convite inválido ou expirado"}
          </div>
        )}

        {!inviteToken && (
          <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs px-3 py-2 rounded-lg mb-4 text-center">
            <img src="/bey-removebg-preview.png" alt="" className="w-4 h-4 object-contain inline-block mr-1" />Você será cadastrado como Participante
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome Completo</label>
            <input
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Seu nome"
              className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">E-mail</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              required
              placeholder="voce@exemplo.com"
              className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Nome da Beyblade <span className="text-gray-500 font-normal">(opcional)</span>
            </label>
            <input
              name="beyblade"
              type="text"
              value={form.beyblade}
              onChange={handleChange}
              placeholder="ex: Brave Valkyrie"
              className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Senha</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              required
              placeholder="Mínimo 6 caracteres"
              className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirmar Senha</label>
            <input
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              required
              placeholder="Repita a senha"
              className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading || (!!inviteToken && inviteChecking)}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-colors text-base mt-2"
          >
            {loading ? "Criando conta..." : "Criar Conta"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          Já tem uma conta?{" "}
          <Link href="/login" className="text-amber-400 hover:text-amber-300 font-medium">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
