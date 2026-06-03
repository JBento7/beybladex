"use client";

export default function DashboardError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-8">
      <div className="bg-[#1a1a1a] border border-red-700 rounded-2xl p-8 max-w-2xl w-full">
        <h2 className="text-xl font-bold text-red-400 mb-4">Erro no Dashboard</h2>
        <pre className="text-sm text-gray-300 bg-[#252525] rounded-lg p-4 overflow-auto whitespace-pre-wrap break-all">
          {error.message || "Erro desconhecido"}
          {"\n\n"}
          {error.stack || ""}
        </pre>
        <p className="text-gray-500 text-xs mt-3">Digest: {error.digest}</p>
      </div>
    </div>
  );
}
