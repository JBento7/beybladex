// Display formatting shared by cards and the home panel.
// Event dates are typed as local wall time and stored as-is (UTC), so they
// are shown in UTC to come out exactly as typed.
export function formatEventDate(iso: string | Date | null | undefined, withTime: boolean): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (!withTime) return date;
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

export function hasWallTime(iso: string | Date | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
}

const FORMAT_LABELS: Record<string, string> = {
  ROUND_ROBIN: "Suíço",
  SWISS: "Suíço",
  GROUPS: "Grupos",
  SINGLE_ELIMINATION: "Eliminação simples",
};

export function formatLabel(format: string, qualifiers?: number | null, deckType?: string | null): string {
  const base = FORMAT_LABELS[format] ?? format;
  const ko = (format === "ROUND_ROBIN" || format === "SWISS") && qualifiers ? ` + mata-mata (top ${qualifiers})` : "";
  const deck = deckType === "THREE_ON_THREE" ? " · Deck 3on3" : deckType === "THREE_ON_THREE_PLUS_ONE" ? " · Deck 3on3 + 1 reserva" : deckType ? " · Solo" : "";
  return `${base}${ko}${deck}`;
}

export function formatMoney(v: number | null | undefined): string | null {
  if (v == null) return null;
  return v > 0 ? `R$ ${v.toFixed(2).replace(".", ",")}` : "Gratuita";
}
