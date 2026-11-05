import Link from "next/link";
import { all } from "@/lib/db";

export const dynamic = "force-dynamic";

type Hit = { video_id: string; title: string; channel_title: string; kind: string; ts: number | null; snippet: string };

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Find the transcript line containing the query and return [seconds, text]. */
function transcriptHits(transcript: string, q: string, max = 3): { ts: number; text: string }[] {
  const out: { ts: number; text: string }[] = [];
  const lower = q.toLowerCase();
  for (const line of transcript.split("\n")) {
    if (line.toLowerCase().includes(lower)) {
      const m = line.match(/^\[(\d+)\]\s*(.*)$/);
      out.push({ ts: m ? Number(m[1]) : 0, text: m ? m[2] : line });
      if (out.length >= max) break;
    }
  }
  return out;
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const hits: Hit[] = [];

  if (query.length >= 2) {
    const like = `%${escapeLike(query)}%`;
    for (const n of all<{ video_id: string; title: string; channel_title: string; ts_sec: number; text: string }>(
      "SELECT n.video_id, v.title, v.channel_title, n.ts_sec, n.text FROM notes n JOIN videos v ON v.id = n.video_id WHERE n.text LIKE ? ESCAPE '\\' LIMIT 50",
      like,
    )) {
      hits.push({ video_id: n.video_id, title: n.title, channel_title: n.channel_title, kind: "Your note", ts: n.ts_sec, snippet: n.text });
    }
    for (const v of all<{ id: string; title: string; channel_title: string; transcript: string }>(
      "SELECT id, title, channel_title, transcript FROM videos WHERE transcript LIKE ? ESCAPE '\\' LIMIT 30",
      like,
    )) {
      for (const h of transcriptHits(v.transcript, query)) {
        hits.push({ video_id: v.id, title: v.title, channel_title: v.channel_title, kind: "Transcript", ts: h.ts, snippet: h.text });
      }
    }
    for (const v of all<{ id: string; title: string; channel_title: string; summary: string | null }>(
      "SELECT id, title, channel_title, summary FROM videos WHERE (title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\') AND status = 'scored' LIMIT 30",
      like,
      like,
    )) {
      hits.push({ video_id: v.id, title: v.title, channel_title: v.channel_title, kind: v.summary ? "Video / summary" : "Video", ts: null, snippet: v.title });
    }
  }

  // One entry per video, with each matching moment listed under it.
  const groups = new Map<string, Hit[]>();
  for (const h of hits) groups.set(h.video_id, [...(groups.get(h.video_id) ?? []), h]);

  return (
    <div className="stack results">
      <h1>{query ? `Results for “${query}”` : "Search"}</h1>
      <p className="muted small">Searches your notes, the transcripts of videos you&apos;ve opened, and your feed. Not all of YouTube, on purpose.</p>
      {query.length >= 2 ? (
        hits.length ? (
          <div className="list">
            {[...groups.values()].map((g) => {
              const moments = g.filter((h) => !h.kind.startsWith("Video"));
              const h = g[0];
              return (
                <article key={h.video_id} className="result">
                  <Link href={`/watch/${h.video_id}`} aria-label={`Watch ${h.title}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://i.ytimg.com/vi/${h.video_id}/mqdefault.jpg`} alt="" loading="lazy" />
                  </Link>
                  <div className="grow">
                    <Link href={`/watch/${h.video_id}`} className="vtitle"><Highlight text={h.title} q={query} /></Link>
                    <div className="vline"><span>{h.channel_title}</span></div>
                    {moments.length ? (
                      <ul className="moments">
                        {moments.map((m, i) => (
                          <li key={i}>
                            <Link href={`/watch/${m.video_id}${m.ts != null ? `?t=${m.ts}` : ""}`}>
                              <span className="moment-at">{m.ts != null ? `${Math.floor(m.ts / 60)}:${String(m.ts % 60).padStart(2, "0")}` : m.kind}</span>
                              <span>{m.kind === "Your note" ? "Your note: " : ""}<Highlight text={m.snippet} q={query} /></span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">No matches for “{query}”.</p>
        )
      ) : null}
    </div>
  );
}
