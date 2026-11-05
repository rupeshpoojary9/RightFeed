/** True when the keyword appears as whole word(s), so "drama" doesn't match "dramatically". */
export function hasKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

/** Keep a link from a third-party feed only if it is a web address. Blocks javascript: and data: links. */
export function safeLink(url: string): string {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

/** True when a browser sent this request from another site. Scripts and cron send no Origin. */
export function isCrossSite(origin: string | null, host: string | null): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/** Read the password from an HTTP Basic auth header. Returns null if the header is malformed. */
export function basicPassword(header: string): string | null {
  if (!header.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const colon = decoded.indexOf(":");
    return colon === -1 ? null : decoded.slice(colon + 1);
  } catch {
    return null;
  }
}
