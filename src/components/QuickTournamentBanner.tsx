"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

export default function QuickTournamentBanner() {
  const { data: session, status } = useSession();

  if (status === "loading" || session) return null;

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-gradient-to-br from-card to-[#1f1a0f] border border-brand-yellow/30 rounded-3xl p-10 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-yellow/10 border border-brand-yellow/30 text-brand-yellow text-xs font-semibold px-3 py-1 rounded-full mb-5">
          <span>⚡</span>
          <span>Sem Cadastro Necessário</span>
        </div>
        <h2 className="text-3xl font-black text-white mb-3">
          Crie um Torneio Agora — Sem Cadastro
        </h2>
        <p className="text-gray-400 text-base mb-8 max-w-lg mx-auto">
          Monte um torneio rápido direto no navegador, sem precisar criar conta. Ideal para reuniões com amigos.
        </p>
        <Link
          href="/quick-tournament"
          className="inline-block bg-brand-yellow hover:bg-brand-yellow-hover text-black font-black text-lg px-8 py-3.5 rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-brand-yellow/20"
        >
          Criar Torneio Rápido →
        </Link>
      </div>
    </section>
  );
}
