"use client";

import { useEffect, useState } from "react";

type Question = {
  id: string;
  order: number;
  text: string;
  type: "TEXT" | "CHECKBOX";
  options: string[];
};

type Announcement = {
  id: string;
  type: "NEWS" | "POLL";
  title: string;
  content: string;
  questions: Question[];
  active: boolean;
  createdAt: string;
  creator: { name: string };
  _count: { responses: number };
};

type Answer = {
  id: string;
  answerText: string | null;
  selectedOptions: string[];
  question: { id: string; text: string; order: number };
};

type PollResponse = {
  id: string;
  validated: boolean;
  createdAt: string;
  user: { name: string; bladerName: string | null };
  answers: Answer[];
};

// A question being drafted in the form — no id yet.
type DraftQuestion = { text: string; type: "TEXT" | "CHECKBOX"; options: string[] };

const EMPTY_QUESTION: DraftQuestion = { text: "", type: "TEXT", options: ["", ""] };

export default function AnnouncementManager() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [type, setType] = useState<"NEWS" | "POLL">("NEWS");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ ...EMPTY_QUESTION }]);

  const [responsesFor, setResponsesFor] = useState<string | null>(null);
  const [responses, setResponses] = useState<PollResponse[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  async function fetchAnnouncements() {
    setLoading(true);
    const res = await fetch("/api/admin/announcements");
    if (res.ok) setAnnouncements(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  function resetForm() {
    setType("NEWS");
    setTitle("");
    setContent("");
    setQuestions([{ ...EMPTY_QUESTION }]);
    setErr(null);
  }

  function updateQuestion(index: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, { ...EMPTY_QUESTION }]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateOption(qIndex: number, optIndex: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex ? { ...q, options: q.options.map((o, j) => (j === optIndex ? value : o)) } : q
      )
    );
  }

  function addOption(qIndex: number) {
    setQuestions((prev) => prev.map((q, i) => (i === qIndex ? { ...q, options: [...q.options, ""] } : q)));
  }

  function removeOption(qIndex: number, optIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, options: q.options.filter((_, j) => j !== optIndex) } : q))
    );
  }

  async function handleSubmit() {
    setErr(null);
    if (!title.trim() || !content.trim()) {
      setErr("Preencha o título e o conteúdo");
      return;
    }
    if (type === "POLL") {
      if (questions.length === 0) {
        setErr("Adicione ao menos uma pergunta");
        return;
      }
      for (const q of questions) {
        if (!q.text.trim()) {
          setErr("Toda pergunta precisa de um texto");
          return;
        }
        if (q.type === "CHECKBOX" && q.options.filter((o) => o.trim()).length < 2) {
          setErr(`A pergunta "${q.text}" precisa de ao menos duas opções`);
          return;
        }
      }
    }

    setSaving(true);
    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        title: title.trim(),
        content: content.trim(),
        questions: type === "POLL" ? questions : undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      resetForm();
      setShowForm(false);
      fetchAnnouncements();
    } else {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Erro ao criar");
    }
  }

  async function toggleActive(a: Announcement) {
    await fetch(`/api/admin/announcements/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !a.active }),
    });
    fetchAnnouncements();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este item? Essa ação não pode ser desfeita.")) return;
    await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    if (responsesFor === id) setResponsesFor(null);
    fetchAnnouncements();
  }

  async function viewResponses(id: string) {
    if (responsesFor === id) {
      setResponsesFor(null);
      return;
    }
    setResponsesFor(id);
    setLoadingResponses(true);
    const res = await fetch(`/api/admin/announcements/${id}/responses`);
    if (res.ok) setResponses(await res.json());
    setLoadingResponses(false);
  }

  async function validateResponse(announcementId: string, responseId: string, validated: boolean) {
    await fetch(`/api/admin/announcements/${announcementId}/responses/${responseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validated }),
    });
    setResponses((prev) => prev.map((r) => (r.id === responseId ? { ...r, validated } : r)));
  }

  return (
    <div className="mt-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Recados &amp; Enquetes</h2>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            if (showForm) resetForm();
          }}
          className="text-sm px-4 py-2 bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold rounded-lg transition-colors"
        >
          {showForm ? "Cancelar" : "+ Novo"}
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 rounded-xl border border-[#2a2a2a] bg-[#252525]">
          {err && (
            <div className="mb-3 text-sm px-4 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
              {err}
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setType("NEWS")}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                type === "NEWS" ? "bg-[#f0a500] text-black" : "bg-[#1a1a1a] text-gray-400 border border-[#333]"
              }`}
            >
              Recado
            </button>
            <button
              onClick={() => setType("POLL")}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                type === "POLL" ? "bg-[#f0a500] text-black" : "bg-[#1a1a1a] text-gray-400 border border-[#333]"
              }`}
            >
              Enquete
            </button>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            className="w-full mb-2 bg-[#1a1a1a] border border-[#333] rounded-lg p-2 text-sm text-white focus:outline-none focus:border-[#f0a500]"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={type === "NEWS" ? "Conteúdo do recado" : "Descrição/introdução da enquete"}
            rows={3}
            className="w-full mb-2 bg-[#1a1a1a] border border-[#333] rounded-lg p-2 text-sm text-white focus:outline-none focus:border-[#f0a500]"
          />

          {type === "POLL" && (
            <div className="flex flex-col gap-3 mt-2">
              {questions.map((q, qi) => (
                <div key={qi} className="rounded-lg border border-[#333] bg-[#1a1a1a] p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="mt-2 text-xs font-bold text-gray-500 shrink-0">#{qi + 1}</span>
                    <input
                      value={q.text}
                      onChange={(e) => updateQuestion(qi, { text: e.target.value })}
                      placeholder="Texto da pergunta"
                      className="flex-1 bg-[#252525] border border-[#333] rounded-lg p-2 text-sm text-white focus:outline-none focus:border-[#f0a500]"
                    />
                    {questions.length > 1 && (
                      <button
                        onClick={() => removeQuestion(qi)}
                        className="px-3 py-2 rounded-lg bg-[#252525] border border-[#333] text-gray-400 hover:text-red-400 transition-colors shrink-0"
                        title="Remover pergunta"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2 mb-2 ml-6">
                    <button
                      onClick={() => updateQuestion(qi, { type: "TEXT" })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        q.type === "TEXT" ? "bg-[#f0a500] text-black" : "bg-[#252525] text-gray-400 border border-[#333]"
                      }`}
                    >
                      Texto descritivo
                    </button>
                    <button
                      onClick={() => updateQuestion(qi, { type: "CHECKBOX" })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        q.type === "CHECKBOX" ? "bg-[#f0a500] text-black" : "bg-[#252525] text-gray-400 border border-[#333]"
                      }`}
                    >
                      Múltipla escolha
                    </button>
                  </div>

                  {q.type === "CHECKBOX" && (
                    <div className="flex flex-col gap-1.5 ml-6">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex gap-2">
                          <input
                            value={opt}
                            onChange={(e) => updateOption(qi, oi, e.target.value)}
                            placeholder={`Opção ${oi + 1}`}
                            className="flex-1 bg-[#252525] border border-[#333] rounded-lg p-2 text-sm text-white focus:outline-none focus:border-[#f0a500]"
                          />
                          {q.options.length > 2 && (
                            <button
                              onClick={() => removeOption(qi, oi)}
                              className="px-3 rounded-lg bg-[#252525] border border-[#333] text-gray-400 hover:text-red-400 transition-colors"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => addOption(qi)}
                        className="text-xs text-[#f0a500] hover:text-[#d4940a] font-bold self-start"
                      >
                        + Adicionar opção
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={addQuestion}
                className="text-sm text-[#f0a500] hover:text-[#d4940a] font-bold self-start"
              >
                + Adicionar pergunta
              </button>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full mt-4 bg-[#c8102e] hover:bg-[#a50d26] disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-colors"
          >
            {saving ? "Salvando..." : "Publicar"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm py-4 text-center">Carregando...</p>
      ) : announcements.length === 0 ? (
        <p className="text-gray-500 text-sm py-4 text-center">Nenhum recado ou enquete criado</p>
      ) : (
        <div className="flex flex-col gap-2">
          {announcements.map((a) => (
            <div key={a.id} className="rounded-xl border border-[#2a2a2a] bg-[#252525]">
              <div className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      a.type === "POLL" ? "bg-blue-900/40 text-blue-400" : "bg-[#f0a500]/20 text-[#f0a500]"
                    }`}>
                      {a.type === "POLL" ? "ENQUETE" : "RECADO"}
                    </span>
                    {a.type === "POLL" && a.questions.length > 1 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300">
                        {a.questions.length} PERGUNTAS
                      </span>
                    )}
                    {!a.active && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
                        INATIVO
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-white truncate">{a.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{a.content}</div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    Por {a.creator.name} · {new Date(a.createdAt).toLocaleString("pt-BR")}
                    {a.type === "POLL" ? ` · ${a._count.responses} resposta(s)` : ""}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {a.type === "POLL" && (
                    <button
                      onClick={() => viewResponses(a.id)}
                      className="text-xs px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#333] text-gray-300 rounded-lg transition-colors"
                    >
                      {responsesFor === a.id ? "Ocultar" : "Respostas"}
                    </button>
                  )}
                  <button
                    onClick={() => toggleActive(a)}
                    className="text-xs px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#333] text-gray-300 rounded-lg transition-colors"
                  >
                    {a.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="text-xs px-3 py-1.5 bg-[#c8102e]/20 hover:bg-[#c8102e]/40 text-red-400 rounded-lg transition-colors"
                  >
                    Excluir
                  </button>
                </div>
              </div>

              {responsesFor === a.id && (
                <div className="border-t border-[#2a2a2a] p-3">
                  {loadingResponses ? (
                    <p className="text-gray-500 text-xs py-2 text-center">Carregando...</p>
                  ) : responses.length === 0 ? (
                    <p className="text-gray-500 text-xs py-2 text-center">Nenhuma resposta ainda</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {responses.map((r) => (
                        <div key={r.id} className="p-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white">{r.user.bladerName || r.user.name}</div>
                            <div className="flex flex-col gap-1 mt-1">
                              {[...r.answers].sort((x, y) => x.question.order - y.question.order).map((ans) => (
                                <div key={ans.id} className="text-xs text-gray-400">
                                  <span className="text-gray-500">{ans.question.text}: </span>
                                  {ans.answerText || ans.selectedOptions.join(", ") || "—"}
                                </div>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => validateResponse(a.id, r.id, !r.validated)}
                            className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 transition-colors ${
                              r.validated
                                ? "bg-green-900/40 text-green-400"
                                : "bg-[#252525] text-gray-400 hover:bg-[#333]"
                            }`}
                          >
                            {r.validated ? "Validado ✓" : "Validar"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
