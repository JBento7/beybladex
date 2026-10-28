// Session-dependent pages: never stored for offline use. Plain module (edge
// middleware + unit tests). public/sw.js keeps its own copy of the rule
// (a service worker can't import app code); tests/sw-rules.test.ts checks
// that both agree.
export const PRIVATE_PAGE = /^\/(dashboard|profile|admin|juiz|arena|test-tournaments|beyparts|verify-email|reset-password|tournaments\/create)(\/|$)|^\/tournaments\/[^/]+\/(edit|certificates)(\/|$)/;

export function isPrivatePage(pathname: string): boolean {
  return PRIVATE_PAGE.test(pathname);
}
