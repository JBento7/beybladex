"use client";

import { useState } from "react";
import ComboSuggester from "./ComboSuggester";
import ComboAnalyzer from "./ComboAnalyzer";

export default function CombosTabs() {
  const [tab, setTab] = useState<"suggest" | "analyze">("suggest");

  return (
    <div>
      <div className="flex gap-2 mb-6 border-b border-[#2a2a2a]">
        <TabButton active={tab === "suggest"} onClick={() => setTab("suggest")}>
          Sugestões
        </TabButton>
        <TabButton active={tab === "analyze"} onClick={() => setTab("analyze")}>
          Analisar meu combo
        </TabButton>
      </div>

      {tab === "suggest" ? <ComboSuggester /> : <ComboAnalyzer />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 font-semibold text-sm -mb-px border-b-2 transition-colors ${
        active
          ? "border-[#f0a500] text-[#f0a500]"
          : "border-transparent text-gray-400 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
