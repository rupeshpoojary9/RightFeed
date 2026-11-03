import Link from "next/link";
import { all } from "@/lib/db";
import { rescueVideo } from "@/app/actions";
import type { Goal, Video } from "@/lib/types";
import VideoCard from "@/components/VideoCard";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "later", label: "Watch later" },
  { key: "history", label: "History" },
  { key: "filtered", label: "Filtered out" },
] as const;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "later" } = await searchParams;
  const goals = all<Goal>("SELECT * FROM goals");
  const goalName = new Map(goals.map((g) => [g.id, g.name]));

  return (
    <div className="stack">
      <h1>Library</h1>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <Link key={t.key} href={`/library?tab=${t.key}`} role="tab" aria-selected={tab === t.key} className="btn ghost" style={tab === t.key ? { fontWeight: 600, borderBottom: "2px solid var(--accent)", borderRadius: 0 } : { borderRadius: 0 }}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "later" ? <Later goalName={goalName} /> : tab === "history" ? <History goalName={goalName} /> : <Filtered />}
    </div>
  );
}

function Later({ goalName }: { goalName: Map<number, string> }) {
  const videos = all<Video>("SELECT * FROM videos WHERE watch_later = 1 AND completed_at IS NULL ORDER BY score DESC");
  if (!videos.length) return <p className="muted">Nothing saved. Tap ☆ on any video to keep it for later.</p>;
  return (
    <div className="grid">
      {videos.map((v) => <VideoCard key={v.id} video={v} goalName={v.goal_id ? goalName.get(v.goal_id) : null} />)}
    </div>
  );
}

function History({ goalName }: { goalName: Map<number, string> }) {
  const rows = all<Video & { last_day: string; secs: number; intents: string }>(
    `SELECT v.*, MAX(w.day) AS last_day, SUM(w.seconds) AS secs, GROUP_CONCAT(DISTINCT w.intent) AS intents
     FROM watch_sessions w JOIN videos v ON v.id = w.video_id GROUP BY v.id ORDER BY MAX(w.started_at) DESC LIMIT 100`,
  );
  if (!rows.length) return <p className="muted">You haven&apos;t watched anything yet.</p>;
  return (
    <div className="list">
      {rows.map((v) => (
        <Link key={v.id} href={`/watch/${v.id}`} className="list-row" style={{ textDecoration: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.thumbnail ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" />
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{v.title}</div>
            <div className="small muted">
              {v.channel_title} · {v.last_day} · {Math.round(v.secs / 60)} min watched {v.completed_at ? "· ✓ done" : ""}
              {v.goal_id && goalName.get(v.goal_id) ? ` · ${goalName.get(v.goal_id)}` : ""}
            </div>
            <div className="small muted">Why: {v.intents}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Filtered() {
  const rules = all<Video>("SELECT * FROM videos WHERE status = 'filtered' ORDER BY created_at DESC LIMIT 60");
  const low = all<Video>("SELECT * FROM videos WHERE status = 'scored' AND score < 5 ORDER BY created_at DESC LIMIT 60");
  return (
    <div className="stack">
      <p className="small muted">
        What MyTube kept away from you, and why. If something here was wrongly dropped, rescue it: it goes to Watch later and teaches the judge.
      </p>
      <h2>Dropped by your rules ({rules.length})</h2>
      <FilteredList videos={rules} reason={(v) => v.filter_reason ?? ""} />
      <h2>Low score from the judge ({low.length})</h2>
      <FilteredList videos={low} reason={(v) => `${v.score?.toFixed(0)}/10: ${v.score_reason ?? ""}`} />
    </div>
  );
}

function FilteredList({ videos, reason }: { videos: Video[]; reason: (v: Video) => string }) {
  if (!videos.length) return <p className="small muted">None.</p>;
  return (
    <details>
      <summary className="small">Show {videos.length}</summary>
      <div className="list" style={{ marginTop: 8 }}>
        {videos.map((v) => (
          <div key={v.id} className="list-row" style={{ alignItems: "center" }}>
            <div className="grow">
              <div>{v.title}</div>
              <div className="small muted">{v.channel_title} · {reason(v)}</div>
            </div>
            <form action={rescueVideo}>
              <input type="hidden" name="id" value={v.id} />
              <button className="small">Rescue</button>
            </form>
          </div>
        ))}
      </div>
    </details>
  );
}
