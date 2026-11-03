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

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>Search</h1>
      <p className="muted small">Searches your notes, the transcripts of videos you&apos;ve opened, and your feed. Not all of YouTube, on purpose.</p>
      <form className="inline-form">
        <input name="q" defaultValue={query} placeholder="e.g. compound interest, dopamine, morning routine" aria-label="Search" autoFocus />
        <button className="primary">Search</button>
      </form>
      {query.length >= 2 ? (
        hits.length ? (
          <div className="list">
            {hits.map((h, i) => (
              <Link key={i} href={`/watch/${h.video_id}${h.ts != null ? `?t=${h.ts}` : ""}`} className="list-row" style={{ textDecoration: "none" }}>
                <div className="grow">
                  <div className="small muted">
                    {h.kind}
                    {h.ts != null ? ` at ${Math.floor(h.ts / 60)}:${String(h.ts % 60).padStart(2, "0")}` : ""} · {h.title} · {h.channel_title}
                  </div>
                  <div><Highlight text={h.snippet} q={query} /></div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">No matches for “{query}”.</p>
        )
      ) : null}
    </div>
  );
}
