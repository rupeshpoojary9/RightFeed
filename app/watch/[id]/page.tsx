import Icon from "@/components/Icons";
import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { budgetStatus } from "@/lib/ingest";
import { getVideo, pathOutline, watchLaterList } from "@/lib/learn";
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
  searchParams: Promise<{ t?: string; list?: string }>;
}) {
  const { id } = await params;
  const { t, list } = await searchParams;
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
  const stepNo = pathStep ? pathOutline(pathStep.path_id).flatMap((g) => g.steps).find((s) => s.id === id)?.no : undefined;
  const b = budgetStatus();
  const queue = list === "later" ? watchLaterList() : [];
  const place = queue.findIndex((v) => v.id === id);
  const next = queue[place + 1] ?? (place > 0 ? queue[0] : undefined);

  return (
    <WatchClient
      video={{ id: video.id, title: video.title, completed: Boolean(video.completed_at) }}
      initialNotes={notes}
      initialActions={actions}
      initialSummary={video.summary ? (JSON.parse(video.summary) as Summary) : null}
      initialFeedback={feedback}
      initialWatchLater={Boolean(video.watch_later)}
      cardsCount={cards}
      budget={{ remaining: b.remaining, budget: b.budget, locked: b.locked }}
      aiEnabled={hasAi()}
      startAt={startAt}
      heading={<h1 className="watch-title">{video.title}</h1>}
      addToPath={<Link href={`/paths/add?video=${video.id}`} className="btn"><Icon name="path" size={20} />Add to path</Link>}
      owner={
        <div className="owner-id">
          <span className="avatar" aria-hidden="true">{video.channel_title.slice(0, 1).toUpperCase()}</span>
          <a href={`https://www.youtube.com/channel/${video.channel_id}`} target="_blank" rel="noreferrer">{video.channel_title}</a>
        </div>
      }
      details={
        <>
        {queue.length ? (
          <div className="queue-bar">
            <Link href="/library?tab=later"><strong>Watch later</strong></Link>
            <span className="muted">{place >= 0 ? `${place + 1} of ${queue.length}` : `${queue.length} left`}</span>
            {next ? <Link href={`/watch/${next.id}?list=later`} className="queue-next">Next: {next.title}</Link> : null}
          </div>
        ) : null}
        <div className="desc">
          <div className="vline">
            {video.published_at ? <span>{timeAgo(video.published_at)}</span> : null}
            {video.duration_sec ? <span>{formatDuration(video.duration_sec)}</span> : null}
            {video.score != null ? <span className="vscore">Score {video.score.toFixed(0)}/10</span> : null}
            {goal ? <span>{goal.name}</span> : null}
          </div>
          {video.score_reason ? <p>{video.score_reason}</p> : null}
          {pathStep ? (
            <p>
              Step {stepNo} of {pathStep.total} in <Link href={`/paths/${pathStep.path_id}`}>{pathStep.title}</Link>. {pathStep.why}
            </p>
          ) : null}
          {video.description ? (
            <details style={{ marginTop: 8 }}>
              <summary>Description</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{video.description.slice(0, 3000)}</p>
            </details>
          ) : null}
        </div>
        </>
      }
    />
  );
}
