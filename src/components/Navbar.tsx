"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export default function Navbar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🌀</span>
            <span className="text-xl font-bold text-amber-400">BeybladeX</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <Link
              href="/tournaments"
              className="text-gray-300 hover:text-amber-400 transition-colors font-medium"
            >
              Torneios
            </Link>
            {session && (
              <>
                <Link
                  href="/dashboard"
                  className="text-gray-300 hover:text-amber-400 transition-colors font-medium"
                >
                  Painel
                </Link>
                <Link
                  href="/profile"
                  className="text-gray-300 hover:text-amber-400 transition-colors font-medium"
                >
                  Perfil
                </Link>
                {session.user.role === "ORGANIZER" && (
                  <Link
                    href="/tournaments/create"
                    className="text-gray-300 hover:text-amber-400 transition-colors font-medium"
                  >
                    Criar
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Auth buttons */}
          <div className="hidden md:flex items-center gap-3">
            {session ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">
                  {session.user.name}
                  {session.user.role === "ORGANIZER" && (
                    <span className="ml-1 text-xs bg-amber-500 text-black px-1.5 py-0.5 rounded font-semibold">
                      ORG
                    </span>
                  )}
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="text-sm bg-gray-700 hover:bg-gray-600 px-4 py-1.5 rounded-lg text-gray-200 transition-colors"
                >
                  Sair
                </button>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-gray-300 hover:text-amber-400 transition-colors font-medium"
                >
                  Entrar
                </Link>
                <Link
                  href="/register"
                  className="text-sm bg-amber-500 hover:bg-amber-400 text-black px-4 py-1.5 rounded-lg font-semibold transition-colors"
                >
                  Cadastrar
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-gray-300 hover:text-amber-400 p-2"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden pb-4 pt-2 border-t border-gray-800 space-y-2">
            <Link
              href="/tournaments"
              className="block px-3 py-2 text-gray-300 hover:text-amber-400 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Torneios
            </Link>
            {session && (
              <>
                <Link href="/dashboard" className="block px-3 py-2 text-gray-300 hover:text-amber-400" onClick={() => setMenuOpen(false)}>Painel</Link>
                <Link href="/profile" className="block px-3 py-2 text-gray-300 hover:text-amber-400" onClick={() => setMenuOpen(false)}>Perfil</Link>
                {session.user.role === "ORGANIZER" && (
                  <Link href="/tournaments/create" className="block px-3 py-2 text-gray-300 hover:text-amber-400" onClick={() => setMenuOpen(false)}>Criar Torneio</Link>
                )}
                <button
                  onClick={() => { signOut({ callbackUrl: "/" }); setMenuOpen(false); }}
                  className="block w-full text-left px-3 py-2 text-red-400 hover:text-red-300"
                >
                  Sair
                </button>
              </>
            )}
            {!session && (
              <>
                <Link href="/login" className="block px-3 py-2 text-gray-300 hover:text-amber-400" onClick={() => setMenuOpen(false)}>Entrar</Link>
                <Link href="/register" className="block px-3 py-2 text-amber-400 font-semibold" onClick={() => setMenuOpen(false)}>Cadastrar</Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
