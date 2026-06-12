"use client";

import { useEffect, useState } from "react";

type NewsItem = { id: string; title: string; content: string; createdAt: string };
type PollItem = {
  id: string;
  title: string;
  content: string;
  pollType: "TEXT" | "CHECKBOX";
  options: string[];
  createdAt: string;
};
type TournamentItem = { id: string; name: string; status: string; isOfficial: boolean };

const STATUS_LABELS: Record<string, string> = {
  REGISTRATION: "Inscrições abertas",
  IN_PROGRESS: "Em andamento",
};

const SEEN_KEY = "beybladex_seen_items";
const HIDDEN_KEY = "beybladex_hidden_items";

export default function NewsPopup() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [tournaments, setTournaments] = useState<TournamentItem[]>([]);
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/announcements")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;

        let hidden: string[] = [];
        let seen: string[] = [];
        try {
          hidden = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
          seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
        } catch {
          hidden = [];
          seen = [];
        }

        const visibleNews: NewsItem[] = (data.news || []).filter(
          (n: NewsItem) => !hidden.includes(`news:${n.id}`)
        );
        const allPolls: PollItem[] = data.polls || [];
        const visibleTournaments: TournamentItem[] = (data.tournaments || []).filter(
          (t: TournamentItem) => !hidden.includes(`tournament:${t.id}`)
        );

        setNews(visibleNews);
        setPolls(allPolls);
        setTournaments(visibleTournaments);
        setSeenIds(new Set(seen));

        if (visibleNews.length > 0 || allPolls.length > 0 || visibleTournaments.length > 0) {
          setOpen(true);
        }
      })
      .catch(() => {});
  }, []);

  function close() {
    try {
      const allSeen = new Set<string>(
        JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")
      );
      news.forEach((n) => allSeen.add(`news:${n.id}`));
      tournaments.forEach((t) => allSeen.add(`tournament:${t.id}`));
      localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(allSeen)));
    } catch {}
    setOpen(false);
  }

  function hideForever(key: string) {
    try {
      const hidden = new Set<string>(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"));
      hidden.add(key);
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(hidden)));
    } catch {}
    if (key.startsWith("news:")) {
      const id = key.slice("news:".length);
      setNews((prev) => prev.filter((n) => n.id !== id));
    } else if (key.startsWith("tournament:")) {
      const id = key.slice("tournament:".length);
      setTournaments((prev) => prev.filter((t) => t.id !== id));
    }
  }

  function setTextAnswer(pollId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [pollId]: value }));
  }

  function toggleOption(pollId: string, option: string) {
    setAnswers((prev) => {
      const current = (prev[pollId] as string[] | undefined) || [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [pollId]: next };
    });
  }

  async function submitPoll(poll: PollItem) {
    setSubmitting(poll.id);
    const value = answers[poll.id];
    const body =
      poll.pollType === "TEXT"
        ? { answerText: value || "" }
        : { selectedOptions: value || [] };

    const res = await fetch(`/api/announcements/${poll.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(null);
    if (res.ok) {
      setSubmitted((prev) => ({ ...prev, [poll.id]: true }));
    }
  }

  if (!open) return null;

  const remainingPolls = polls.filter((p) => !submitted[p.id]);
  const hasContent = news.length > 0 || remainingPolls.length > 0 || tournaments.length > 0;

  if (!hasContent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={close} />
      <div className="relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto">
        <h2 className="text-xl font-black text-white mb-4">📣 Novidades</h2>

        {tournaments.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-bold text-[#f0a500] mb-2">Torneios</h3>
            <div className="flex flex-col gap-2">
              {tournaments.map((t) => (
                <div key={t.id} className="rounded-xl border border-[#2a2a2a] bg-[#252525] overflow-hidden">
                  <a
                    href={`/tournaments/${t.id}`}
                    className="block p-3 hover:border-[#f0a500] transition-colors"
                  >
                    <div className="text-sm font-bold text-white">{t.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {STATUS_LABELS[t.status] || t.status}
                      {t.isOfficial ? " · Oficial" : ""}
                    </div>
                  </a>
                  {seenIds.has(`tournament:${t.id}`) && (
                    <button
                      onClick={() => hideForever(`tournament:${t.id}`)}
                      className="w-full text-xs text-gray-500 hover:text-gray-300 border-t border-[#2a2a2a] py-1.5 transition-colors"
                    >
                      Não mostrar novamente
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {news.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-bold text-[#f0a500] mb-2">Avisos</h3>
            <div className="flex flex-col gap-2">
              {news.map((n) => (
                <div key={n.id} className="rounded-xl border border-[#2a2a2a] bg-[#252525] overflow-hidden">
                  <div className="p-3">
                    <div className="text-sm font-bold text-white">{n.title}</div>
                    <div className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">{n.content}</div>
                  </div>
                  {seenIds.has(`news:${n.id}`) && (
                    <button
                      onClick={() => hideForever(`news:${n.id}`)}
                      className="w-full text-xs text-gray-500 hover:text-gray-300 border-t border-[#2a2a2a] py-1.5 transition-colors"
                    >
                      Não mostrar novamente
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {remainingPolls.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-bold text-[#f0a500] mb-2">Enquetes</h3>
            <div className="flex flex-col gap-3">
              {remainingPolls.map((p) => (
                <div key={p.id} className="p-3 rounded-xl border border-[#2a2a2a] bg-[#252525]">
                  <div className="text-sm font-bold text-white">{p.title}</div>
                  <div className="text-xs text-gray-400 mt-1 mb-2 whitespace-pre-wrap">{p.content}</div>

                  {p.pollType === "TEXT" ? (
                    <textarea
                      value={(answers[p.id] as string) || ""}
                      onChange={(e) => setTextAnswer(p.id, e.target.value)}
                      placeholder="Sua resposta..."
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg p-2 text-sm text-white focus:outline-none focus:border-[#f0a500]"
                      rows={3}
                    />
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {p.options.map((opt) => {
                        const selected = ((answers[p.id] as string[]) || []).includes(opt);
                        return (
                          <label key={opt} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleOption(p.id, opt)}
                              className="accent-[#f0a500]"
                            />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => submitPoll(p)}
                    disabled={submitting === p.id}
                    className="mt-3 text-xs bg-[#f0a500] hover:bg-[#d4940a] disabled:opacity-50 text-black font-bold px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {submitting === p.id ? "Enviando..." : "Enviar resposta"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={close}
          className="w-full bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-2.5 rounded-xl transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
