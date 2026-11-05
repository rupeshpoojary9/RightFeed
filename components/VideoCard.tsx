import Link from "next/link";
import { formatDuration, timeAgo } from "@/lib/dates";
import type { Video } from "@/lib/types";
import CardActions from "./CardActions";

export default function VideoCard({
  video,
  goalName,
  watched,
  progress = 0,
  eager = false,
  pick = false,
  showActions = true,
}: {
  video: Video;
  goalName?: string | null;
  watched?: boolean;
  /** Share of the video played so far, 0 to 1. */
  progress?: number;
  /** First row of the grid: load straight away instead of lazily. */
  eager?: boolean;
  /** Part of the lineup, so it can be dropped and replaced. */
  pick?: boolean;
  showActions?: boolean;
}) {
  const done = Boolean(video.completed_at);
  const played = done ? 1 : progress;
  return (
    <article className="vcard">
      <Link href={`/watch/${video.id}`} className="thumb" aria-label={`Watch ${video.title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={video.thumbnail ?? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt="" loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} />
        {done ? <span className="state">Done</span> : watched ? <span className="state">Started</span> : null}
        {video.duration_sec ? <span className="dur">{formatDuration(video.duration_sec)}</span> : null}
        {played > 0 ? <span className="watched-bar"><span style={{ transform: `scaleX(${played})` }} /></span> : null}
      </Link>
      <div className="vmeta">
        <span className="avatar" aria-hidden="true">{video.channel_title.slice(0, 1).toUpperCase()}</span>
        <div>
          <Link href={`/watch/${video.id}`} className="vtitle">{video.title}</Link>
          <div className="vline">
            <span>{video.channel_title}</span>
            {video.published_at ? <span>{timeAgo(video.published_at)}</span> : null}
          </div>
          <div className="vline">
            {video.score != null ? <span className="vscore" title="Growth score (0-10)">Score {video.score.toFixed(0)}</span> : null}
            {goalName ? <span>{goalName}</span> : null}
          </div>
          {video.score_reason ? <div className="vwhy">{video.score_reason}</div> : null}
        </div>
        {showActions ? <CardActions videoId={video.id} channelId={video.channel_id} channelTitle={video.channel_title} watchLater={Boolean(video.watch_later)} pick={pick && !done} /> : null}
      </div>
    </article>
  );
}
