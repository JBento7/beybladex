"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ background: "#0d0d0d", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🌀</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Algo deu errado</h2>
            <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 24 }}>
              Ocorreu um erro inesperado. Tente novamente.
            </p>
            <button
              onClick={() => reset()}
              style={{ background: "#f0a500", color: "#000", fontWeight: 700, fontSize: 14, padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer" }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
