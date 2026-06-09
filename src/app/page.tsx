import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import QuickTournamentBanner from "@/components/QuickTournamentBanner";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");
  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <nav className="border-b border-[#2a2a2a] bg-[#1a1a1a]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 md:h-[100px]">
          <Link href="/">
            <img src="/lblnovo.png" alt="Liga Beyblade Londrina" className="h-14 md:h-[100px] w-auto" />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/tournaments" className="text-gray-300 hover:text-[#f0a500] transition-colors text-sm font-medium hidden sm:block">
              Torneios
            </Link>
            <Link href="/upcoming" className="text-gray-300 hover:text-[#f0a500] transition-colors text-sm font-medium hidden sm:block">
              Próximos
            </Link>
            <Link href="/quick-tournament" className="text-gray-300 hover:text-[#f0a500] transition-colors text-sm font-medium hidden sm:block">
              Torneio Rápido
            </Link>
            <Link href="/login" className="text-gray-300 hover:text-[#f0a500] transition-colors text-sm font-medium">
              Entrar
            </Link>
            <Link href="/register" className="bg-[#c8102e] hover:bg-[#a00d24] text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
              Começar
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#c8102e]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#f0a500]/8 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#c8102e]/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-32 text-center">
          <div className="inline-flex items-center gap-2 bg-[#f0a500]/10 border border-[#f0a500]/30 text-[#f0a500] text-sm font-medium px-4 py-1.5 rounded-full mb-8">
            <span>🏆</span>
            <span>A liga oficial de Beyblade de Londrina</span>
          </div>

          <div className="flex justify-center mb-6">
            <img
              src="/lblnovo.png"
              alt="Liga Beyblade Londrina"
              className="h-40 sm:h-52 lg:h-64 w-auto drop-shadow-2xl"
            />
          </div>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Organize, gerencie e compita em campeonatos de Beyblade. Registre cada
            Burst, Over e Extreme Finish. Suba no ranking e se torne campeão.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold text-lg px-8 py-3.5 rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-[#c8102e]/25">
              Começar Agora
            </Link>
            <Link href="/upcoming" className="bg-[#252525] hover:bg-[#303030] text-white font-semibold text-lg px-8 py-3.5 rounded-xl transition-colors border border-[#2a2a2a]">
              Próximos Campeonatos
            </Link>
          </div>

          <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { label: "Formatos de Torneio", value: "3" },
              { label: "Tipos de Finish", value: "4" },
              { label: "Rankings em Tempo Real", value: "✓" },
              { label: "Geração de Chaves", value: "Auto" },
            ].map((stat) => (
              <div key={stat.label} className="bg-[#1a1a1a]/50 border border-[#2a2a2a] rounded-xl p-4">
                <div className="text-3xl font-black text-[#f0a500] mb-1">{stat.value}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">Formatos de Torneio</h2>
          <p className="text-gray-400 max-w-lg mx-auto">Escolha o formato ideal para o seu campeonato</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            { icon: "🔄", name: "Pontos Corridos", desc: "Todos os jogadores enfrentam uns aos outros. O campeão é definido pela pontuação total.", badge: "Clássico" },
            { icon: "👥", name: "Grupos", desc: "Divididos em grupos para fase de pontos corridos. Os melhores de cada grupo avançam para a eliminatória.", badge: "Estratégico" },
            { icon: "⚔️", name: "Eliminação Simples", desc: "Perdeu, saiu. O formato de maior pressão — cada batalha é decisiva.", badge: "Intenso" },
          ].map((format) => (
            <div key={format.name} className="bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#f0a500]/50 rounded-2xl p-6 transition-all group hover:shadow-lg hover:shadow-[#c8102e]/5">
              <div className="text-4xl mb-4">{format.icon}</div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-white text-lg">{format.name}</h3>
                <span className="text-xs bg-[#f0a500]/20 text-[#f0a500] px-2 py-0.5 rounded-full font-medium">{format.badge}</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">{format.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#1a1a1a]/50 border-y border-[#2a2a2a] py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Sistema de Pontuação</h2>
            <p className="text-gray-400">Pontos concedidos conforme o tipo de finalização da batalha</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[
              { type: "Spin Finish", points: 1, icon: "💫", desc: "Adversário para de girar", color: "from-gray-600 to-gray-700" },
              { type: "Over Finish", points: 2, icon: "💥", desc: "Adversário sai da arena", color: "from-blue-700 to-blue-800" },
              { type: "Burst Finish", points: 2, icon: "💣", desc: "Beyblade do adversário estoura", color: "from-purple-700 to-purple-800" },
              { type: "Extreme Finish", points: 3, icon: "⚡", desc: "Finalização de impacto máximo", color: "from-[#c8102e] to-[#a00d24]" },
            ].map((item) => (
              <div key={item.type} className={`bg-gradient-to-br ${item.color} rounded-2xl p-6 text-center border border-white/10`}>
                <div className="text-4xl mb-3">{item.icon}</div>
                <div className="text-4xl font-black text-white mb-1">
                  {item.points}
                  <span className="text-lg font-normal ml-1 opacity-75">pt{item.points > 1 ? "s" : ""}</span>
                </div>
                <div className="font-bold text-white mb-1">{item.type}</div>
                <div className="text-sm opacity-75">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">Tudo que Você Precisa</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: "🏆", title: "Rankings ao Vivo", desc: "Classificações em tempo real atualizadas instantaneamente conforme os placares são registrados." },
            { icon: "📊", title: "Análise de Partidas", desc: "Detalhamento completo dos tipos de finish, taxa de vitórias e evolução de desempenho." },
            { icon: "🎯", title: "Chaves Automáticas", desc: "Chaves e cronogramas gerados automaticamente ao iniciar o torneio." },
            { icon: "👑", title: "Ferramentas do Organizador", desc: "Qualquer usuário pode criar e gerenciar seus próprios torneios." },
            { icon: "📱", title: "Design Responsivo", desc: "Acompanhe batalhas e classificações de qualquer dispositivo, em qualquer lugar." },
            { icon: "⚙️", title: "Registro de Beyblades", desc: "Registre suas beyblades e acompanhe as estatísticas de cada uma." },
          ].map((feat) => (
            <div key={feat.title} className="flex gap-4 p-6 bg-[#1a1a1a]/50 border border-[#2a2a2a] rounded-2xl">
              <div className="text-3xl flex-shrink-0">{feat.icon}</div>
              <div>
                <h3 className="font-bold text-white mb-1">{feat.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <QuickTournamentBanner />

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 text-center">
        <div className="bg-gradient-to-br from-[#c8102e]/10 to-[#f0a500]/5 border border-[#c8102e]/20 rounded-3xl p-12">
          <h2 className="text-4xl font-black text-white mb-4">Pronto para se Tornar Campeão?</h2>
          <p className="text-gray-400 text-lg mb-8">Junte-se à Liga Beyblade Londrina hoje mesmo.</p>
          <Link href="/register" className="inline-block bg-[#c8102e] hover:bg-[#a00d24] text-white font-black text-xl px-10 py-4 rounded-xl transition-all transform hover:scale-105 shadow-2xl shadow-[#c8102e]/30">
            <img src="/bey-removebg-preview.png" alt="" className="w-5 h-5 object-contain inline-block mr-2" />LET IT RIP!
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#2a2a2a] py-8 text-center text-gray-500 text-sm">
        <p>© {new Date().getFullYear()} LBL — Liga Beyblade Londrina</p>
        <p className="mt-1 text-xs text-gray-600">A liga oficial de Beyblade de Londrina</p>
      </footer>
    </div>
  );
}
