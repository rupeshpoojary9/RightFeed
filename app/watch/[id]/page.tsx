import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { budgetStatus } from "@/lib/ingest";
import { getVideo } from "@/lib/learn";
import { hasAi } from "@/lib/settings";
import { formatDuration, timeAgo } from "@/lib/dates";
import type { Action, Goal, Note, Summary } from "@/lib/types";
import WatchClient from "@/components/WatchClient";

export const dynamic = "force-dynamic";

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const startAt = Math.max(0, Math.floor(Number(t) || 0));
  const video = getVideo(id);
  if (!video) notFound();

  const notes = all<Note>("SELECT * FROM notes WHERE video_id = ? ORDER BY ts_sec", id);
  const actions = all<Action>("SELECT * FROM actions WHERE video_id = ? ORDER BY created_at", id);
  const feedback = get<{ value: number }>("SELECT value FROM feedback WHERE video_id = ?", id)?.value ?? 0;
  const goal = video.goal_id ? get<Goal>("SELECT * FROM goals WHERE id = ?", video.goal_id) : undefined;
  const cards = get<{ n: number }>("SELECT COUNT(*) AS n FROM flashcards WHERE video_id = ?", id)?.n ?? 0;
  const pathStep = get<{ path_id: number; title: string; position: number; total: number; why: string }>(
    `SELECT p.id AS path_id, p.title, pi.position, pi.why, (SELECT COUNT(*) FROM path_items x WHERE x.path_id = p.id) AS total
     FROM path_items pi JOIN paths p ON p.id = pi.path_id WHERE pi.video_id = ? ORDER BY p.created_at DESC LIMIT 1`,
    id,
  );
  const b = budgetStatus();

  return (
    <div className="watch">
      <div className="stack">
        <WatchClient
          video={{ id: video.id, title: video.title, completed: Boolean(video.completed_at) }}
          initialNotes={notes}
          initialActions={actions}
          initialSummary={video.summary ? (JSON.parse(video.summary) as Summary) : null}
          initialFeedback={feedback}
          cardsCount={cards}
          budget={{ remaining: b.remaining, budget: b.budget, locked: b.locked }}
          aiEnabled={hasAi()}
          startAt={startAt}
        />
      </div>
      <aside className="stack" id="side">
        <div className="card">
          <h1 style={{ fontSize: "1.15rem" }}>{video.title}</h1>
          <div className="small muted">
            <a href={`https://www.youtube.com/channel/${video.channel_id}`} target="_blank" rel="noreferrer">{video.channel_title}</a>
            {video.published_at ? ` · ${timeAgo(video.published_at)}` : ""}
            {video.duration_sec ? ` · ${formatDuration(video.duration_sec)}` : ""}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {video.score != null ? <span className="score">{video.score.toFixed(0)}/10</span> : null}
            {goal ? <span className="pill accent">{goal.name}</span> : null}
          </div>
          {video.score_reason ? <p className="small muted" style={{ marginTop: 8 }}>{video.score_reason}</p> : null}
          {pathStep ? (
            <p className="small" style={{ marginBottom: 0 }}>
              Step {pathStep.position + 1} of {pathStep.total} in <Link href={`/paths/${pathStep.path_id}`}>{pathStep.title}</Link>. {pathStep.why}
            </p>
          ) : null}
          {video.description ? (
            <details style={{ marginTop: 8 }}>
              <summary className="small">Description</summary>
              <p className="small" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{video.description.slice(0, 3000)}</p>
            </details>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
