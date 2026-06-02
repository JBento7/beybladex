import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Navbar */}
      <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌀</span>
            <span className="text-xl font-bold text-amber-400">BeybladeX</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/tournaments" className="text-gray-300 hover:text-amber-400 transition-colors text-sm font-medium hidden sm:block">
              Tournaments
            </Link>
            <Link href="/login" className="text-gray-300 hover:text-amber-400 transition-colors text-sm font-medium">
              Login
            </Link>
            <Link
              href="/register"
              className="bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-yellow-500/8 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-600/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-32 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-medium px-4 py-1.5 rounded-full mb-8">
            <span>🏆</span>
            <span>The Ultimate Beyblade Championship Platform</span>
          </div>

          {/* Spinning beyblade SVG decoration */}
          <div className="flex justify-center mb-8">
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: "8s" }}>
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <circle cx="50" cy="50" r="48" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="8 4" />
                  <circle cx="50" cy="50" r="35" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />
                  <polygon points="50,15 62,40 90,40 68,57 76,82 50,65 24,82 32,57 10,40 38,40" fill="#f59e0b" opacity="0.15" />
                  <polygon points="50,15 62,40 90,40 68,57 76,82 50,65 24,82 32,57 10,40 38,40" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.6" />
                  <circle cx="50" cy="50" r="8" fill="#f59e0b" opacity="0.9" />
                  <circle cx="50" cy="50" r="4" fill="#fff" opacity="0.8" />
                </svg>
              </div>
            </div>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white mb-6 leading-tight">
            Let It{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
              Rip!
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Organize, manage, and compete in Beyblade championships. Track every
            Burst, Over, and Extreme Finish. Rise to the top of the leaderboard.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg px-8 py-3.5 rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-amber-500/25"
            >
              Start Your Journey
            </Link>
            <Link
              href="/tournaments"
              className="bg-gray-800 hover:bg-gray-700 text-white font-semibold text-lg px-8 py-3.5 rounded-xl transition-colors border border-gray-700"
            >
              View Tournaments
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { label: "Tournament Formats", value: "4" },
              { label: "Finish Types", value: "4" },
              { label: "Real-time Rankings", value: "✓" },
              { label: "Bracket Generation", value: "Auto" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-gray-900/50 border border-gray-800 rounded-xl p-4"
              >
                <div className="text-3xl font-black text-amber-400 mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Formats Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Tournament Formats
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto">
            Choose the format that fits your championship style
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: "🔄",
              name: "Round Robin",
              desc: "Every blader faces each other. Pure skill determines the champion through total points.",
              badge: "Classic",
            },
            {
              icon: "👥",
              name: "Groups",
              desc: "Divided into groups for round robin play. Top bladers from each group advance to elimination.",
              badge: "Strategic",
            },
            {
              icon: "⚔️",
              name: "Single Elimination",
              desc: "One loss and you're out. The ultimate high-stakes format — every battle matters.",
              badge: "Intense",
            },
            {
              icon: "🇨🇭",
              name: "Swiss",
              desc: "Compete against bladers at your level. No elimination — every round counts toward ranking.",
              badge: "Balanced",
            },
          ].map((format) => (
            <div
              key={format.name}
              className="bg-gray-900 border border-gray-800 hover:border-amber-500/50 rounded-2xl p-6 transition-all group hover:shadow-lg hover:shadow-amber-500/5"
            >
              <div className="text-4xl mb-4">{format.icon}</div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-white text-lg">{format.name}</h3>
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                  {format.badge}
                </span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">{format.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Scoring Section */}
      <section className="bg-gray-900/50 border-y border-gray-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Scoring System
            </h2>
            <p className="text-gray-400">
              Points awarded based on how you finish the battle
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[
              { type: "Spin Finish", points: 1, icon: "💫", desc: "Opponent stops spinning", color: "from-gray-600 to-gray-700" },
              { type: "Over Finish", points: 2, icon: "💥", desc: "Opponent leaves the stadium", color: "from-blue-700 to-blue-800" },
              { type: "Burst Finish", points: 2, icon: "💣", desc: "Opponent's Beyblade bursts", color: "from-purple-700 to-purple-800" },
              { type: "Extreme Finish", points: 3, icon: "⚡", desc: "Maximum impact finish", color: "from-amber-600 to-amber-700" },
            ].map((item) => (
              <div
                key={item.type}
                className={`bg-gradient-to-br ${item.color} rounded-2xl p-6 text-center border border-white/10`}
              >
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

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Everything You Need
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: "🏆", title: "Live Standings", desc: "Real-time leaderboards update instantly as scores are entered." },
            { icon: "📊", title: "Match Analytics", desc: "Detailed breakdown of finish types, win rates, and performance trends." },
            { icon: "🎯", title: "Auto Brackets", desc: "Brackets and schedules generated automatically when tournament starts." },
            { icon: "👑", title: "Organizer Tools", desc: "Full control over tournaments — manage participants, enter scores, track progress." },
            { icon: "📱", title: "Responsive Design", desc: "Track battles and standings from any device, anywhere." },
            { icon: "🔒", title: "Secure Auth", desc: "Role-based access control separates participants from organizers." },
          ].map((feat) => (
            <div
              key={feat.title}
              className="flex gap-4 p-6 bg-gray-900/50 border border-gray-800 rounded-2xl"
            >
              <div className="text-3xl flex-shrink-0">{feat.icon}</div>
              <div>
                <h3 className="font-bold text-white mb-1">{feat.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 text-center">
        <div className="bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border border-amber-500/20 rounded-3xl p-12">
          <h2 className="text-4xl font-black text-white mb-4">
            Ready to Become a Champion?
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            Join the ultimate Beyblade championship platform today.
          </p>
          <Link
            href="/register"
            className="inline-block bg-amber-500 hover:bg-amber-400 text-black font-black text-xl px-10 py-4 rounded-xl transition-all transform hover:scale-105 shadow-2xl shadow-amber-500/30"
          >
            🌀 LET IT RIP!
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-gray-500 text-sm">
        <p>© 2025 BeybladeX — Championship Management Platform</p>
      </footer>
    </div>
  );
}
