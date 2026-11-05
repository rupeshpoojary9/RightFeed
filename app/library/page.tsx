import Link from "next/link";
import { all, get } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { rescueVideo } from "@/app/actions";
import type { Goal, Video } from "@/lib/types";
import CardActions from "@/components/CardActions";
import Icon from "@/components/Icons";
import { formatDuration, formatMinutes } from "@/lib/dates";
import { watchLaterList } from "@/lib/learn";

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
          <Link key={t.key} href={`/library?tab=${t.key}`} role="tab" aria-selected={tab === t.key} >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "later" ? <Later /> : tab === "history" ? <History goalName={goalName} /> : <Filtered />}
    </div>
  );
}

function Later() {
  const videos = watchLaterList();
  if (!videos.length) {
    return (
      <div className="card empty">
        <h2>Your playlist is empty</h2>
        <p>Open the menu on any video and choose Save to Watch later.</p>
      </div>
    );
  }
  const seconds = videos.reduce((n, v) => n + (v.duration_sec ?? 0), 0);
  const first = videos[0];
  return (
    <div className="course">
      <aside className="course-panel">
        <Link href={`/watch/${first.id}?list=later`} className="thumb" aria-label={`Play ${first.title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={first.thumbnail ?? `https://i.ytimg.com/vi/${first.id}/hqdefault.jpg`} alt="" />
        </Link>
        <h2>Watch later</h2>
        <div className="vline">
          <span>{videos.length} {videos.length === 1 ? "video" : "videos"}</span>
          {seconds ? <span>{formatMinutes(seconds)}</span> : null}
        </div>
        <Link href={`/watch/${first.id}?list=later`} className="btn primary course-cta"><Icon name="play" size={18} />Play all</Link>
      </aside>
      <ol className="steps">
        {videos.map((v, i) => (
          <li key={v.id} className="step-item">
            <Link href={`/watch/${v.id}?list=later`} className="step">
              <span className="step-no">{i + 1}</span>
              <span className="thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.thumbnail ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" />
                {v.duration_sec ? <span className="dur">{formatDuration(v.duration_sec)}</span> : null}
              </span>
              <span className="step-head">
                <span className="vtitle">{v.title}</span>
                <span className="vline"><span>{v.channel_title}</span></span>
              </span>
              {v.score_reason ? <span className="step-why">{v.score_reason}</span> : null}
            </Link>
            <CardActions videoId={v.id} channelId={v.channel_id} channelTitle={v.channel_title} watchLater inPlaylist />
          </li>
        ))}
      </ol>
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
            <div style={{ fontWeight: 500 }}>{v.title}</div>
            <div className="vline">
              <span>{v.channel_title}</span>
              <span>{v.last_day}</span>
              <span>{Math.round(v.secs / 60)} min watched</span>
              {v.completed_at ? <span>Done</span> : null}
              {v.goal_id && goalName.get(v.goal_id) ? <span>{goalName.get(v.goal_id)}</span> : null}
            </div>
            <div className="small muted">Why: {v.intents}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Filtered() {
  const { threshold } = getSettings();
  const rules = all<Video>("SELECT * FROM videos WHERE status = 'filtered' ORDER BY created_at DESC LIMIT 60");
  const low = all<Video>("SELECT * FROM videos WHERE status = 'scored' AND score < ? ORDER BY created_at DESC LIMIT 60", threshold);
  const rulesTotal = get<{ n: number }>("SELECT COUNT(*) AS n FROM videos WHERE status = 'filtered'")?.n ?? 0;
  const lowTotal = get<{ n: number }>("SELECT COUNT(*) AS n FROM videos WHERE status = 'scored' AND score < ?", threshold)?.n ?? 0;
  return (
    <div className="stack">
      <p className="small muted">
        What RightFeed kept away from you, and why. If something here was wrongly dropped, rescue it: it goes to Watch later and teaches the judge.
      </p>
      <FilteredList title="Dropped by your rules" total={rulesTotal} videos={rules} reason={(v) => v.filter_reason ?? ""} />
      <FilteredList title={`Below your minimum score of ${threshold}`} total={lowTotal} videos={low} reason={(v) => `${v.score?.toFixed(0)}/10: ${v.score_reason ?? ""}`} />
    </div>
  );
}

function FilteredList({ title, total, videos, reason }: { title: string; total: number; videos: Video[]; reason: (v: Video) => string }) {
  if (!videos.length) return <div className="card small muted">{title}: none.</div>;
  return (
    <details className="card filtered-group">
      <summary>
        {title}
        <span className="small muted">{total > videos.length ? `Latest ${videos.length} of ${total}` : total}</span>
      </summary>
      <div className="list">
        {videos.map((v) => (
          <div key={v.id} className="list-row" style={{ alignItems: "center" }}>
            <div className="grow">
              <div>{v.title}</div>
              <div className="vline"><span>{v.channel_title}</span><span>{reason(v)}</span></div>
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
