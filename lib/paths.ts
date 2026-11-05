/** Pure helpers for user-built paths. */

const MAX_SECTIONS = 30;

/** One section per line. Drops list markers, blanks and repeats. */
export function parseSections(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const title = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim().slice(0, 120);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push(title);
    if (out.length === MAX_SECTIONS) break;
  }
  return out;
}

/** Reads a video id from a watch, short, live, embed or youtu.be link, or a bare id. */
export function parseVideoId(input: string): string | null {
  const raw = input.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^(www|m|music)\./, "");
    const id =
      host === "youtu.be" ? url.pathname.split("/")[1]
      : host === "youtube.com" || host === "youtube-nocookie.com"
        ? url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1]
        : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Moves an id one place in a list. Returns the same order at either end. */
export function moved<T>(ids: T[], id: T, direction: "up" | "down"): T[] {
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export type PathGroup<T> = { section: { id: number; title: string } | null; steps: (T & { no: number })[] };

/** Videos with no section come first, then each section in order. Step numbers run through the whole path. */
export function groupSteps<T extends { section_id: number | null; position: number }>(sections: { id: number; title: string }[], items: T[]): PathGroup<T>[] {
  const known = new Set(sections.map((s) => s.id));
  const byPosition = [...items].sort((a, b) => a.position - b.position);
  const loose = byPosition.filter((i) => i.section_id === null || !known.has(i.section_id));
  const groups: { section: { id: number; title: string } | null; steps: T[] }[] = [
    ...(loose.length ? [{ section: null, steps: loose }] : []),
    ...sections.map((section) => ({ section, steps: byPosition.filter((i) => i.section_id === section.id) })),
  ];
  let no = 0;
  return groups.map((g) => ({ section: g.section, steps: g.steps.map((s) => ({ ...s, no: ++no })) }));
}
