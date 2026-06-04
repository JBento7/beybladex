import Navbar from "@/components/Navbar";

// Lightweight skeleton shown while a route's server data is loading.
// Keeps the Navbar in place so navigation feels instant.
export default function PageLoading({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header skeleton */}
        <div className="h-8 w-48 bg-[#1a1a1a] rounded-lg animate-pulse mb-6" />

        {/* Cards skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>

        {/* Content skeleton */}
        <div className="grid lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-12 bg-[#252525] rounded-lg animate-pulse" />
              ))}
            </div>
          ))}
        </div>

        <p className="sr-only">{label}</p>
      </main>
    </div>
  );
}
