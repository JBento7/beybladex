// Test/seed tools (fake users, simulated scores) are off in production unless
// explicitly enabled with ENABLE_TEST_TOOLS=1. Plain module (unit-tested).
export function testToolsAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.ENABLE_TEST_TOOLS === "1") return true;
  return env.VERCEL_ENV !== "production";
}
export const TEST_TOOLS_DISABLED_MESSAGE =
  "Ferramenta de teste desativada em produção. Use um ambiente de homologação (ou ENABLE_TEST_TOOLS=1, ver docs/OPERACAO.md).";
