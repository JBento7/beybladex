// Tournament list filters kept in the URL (?status=&liga=&q=). Plain module so
// both the server page and the client list can import the parsers.
import { COMMUNITY_LIST } from "./communities";

export type StatusFilter = "todos" | "proximos" | "inscricoes" | "andamento" | "anteriores";
export const STATUS_FILTER_KEYS: StatusFilter[] = ["todos", "proximos", "inscricoes", "andamento", "anteriores"];

export function parseStatus(v: string | undefined | null): StatusFilter {
  return STATUS_FILTER_KEYS.includes(v as StatusFilter) ? (v as StatusFilter) : "todos";
}
export function parseLiga(v: string | undefined | null): string {
  return v && COMMUNITY_LIST.some((c) => c.slug === v) ? v : "todas";
}
