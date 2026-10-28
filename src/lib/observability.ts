// Structured logging + error classification for API routes.
// Never logs passwords, session/reset tokens, full cookies or request bodies
// with personal data: callers pass explicit, minimal fields.
import { randomUUID } from "node:crypto";

export type ErrorClass = "validation" | "conflict" | "infrastructure" | "internal";

export function logEvent(event: string, fields: Record<string, unknown> = {}) {
  try {
    console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
  } catch { /* never throw from logging */ }
}

/** Request id: reuse the platform's (Vercel) header when present. */
export function requestIdOf(req: Request): string {
  return req.headers.get("x-vercel-id") ?? req.headers.get("x-request-id") ?? randomUUID();
}

/** Classify an error without leaking database details to the user. */
export function classifyError(e: unknown): ErrorClass {
  const code = (e as { code?: string })?.code ?? "";
  const msg = String((e as Error)?.message ?? e);
  if (code === "P2002" || code === "P2034" || /deadlock|could not serialize/i.test(msg)) return "conflict";
  if (/^P10\d\d$/.test(code) || code === "P2024" || /Can't reach database|ECONNRESET|ETIMEDOUT|connection pool|Timed out fetching/i.test(msg)) return "infrastructure";
  return "internal";
}

export const PUBLIC_ERROR_MESSAGES: Record<ErrorClass, string> = {
  validation: "Dados inválidos.",
  conflict: "Outra operação aconteceu ao mesmo tempo. Atualize e tente novamente.",
  infrastructure: "Serviço temporariamente indisponível. Tente novamente em instantes.",
  internal: "Erro inesperado. Tente novamente.",
};

/** Wraps a route handler: request id, timing, classified errors, safe messages. */
export function withObservability<A extends unknown[]>(
  route: string,
  handler: (req: Request, ...rest: A) => Promise<Response>
) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const id = requestIdOf(req);
    const t0 = performance.now();
    try {
      const res = await handler(req, ...rest);
      logEvent("api", { route, method: req.method, status: res.status, ms: Math.round(performance.now() - t0), requestId: id });
      res.headers.set("x-request-id", id);
      return res;
    } catch (e) {
      const cls = classifyError(e);
      logEvent("api_error", { route, method: req.method, class: cls, code: (e as { code?: string })?.code, ms: Math.round(performance.now() - t0), requestId: id, err: String((e as Error)?.message ?? e).slice(0, 300) });
      const status = cls === "conflict" ? 409 : cls === "infrastructure" ? 503 : 500;
      return Response.json({ error: PUBLIC_ERROR_MESSAGES[cls], requestId: id }, { status, headers: { "x-request-id": id } });
    }
  };
}
