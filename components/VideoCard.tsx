import Link from "next/link";
import { formatDuration, timeAgo } from "@/lib/dates";
import type { Video } from "@/lib/types";
import CardActions from "./CardActions";

export default function VideoCard({
  video,
  goalName,
  watched,
  showActions = true,
}: {
  video: Video;
  goalName?: string | null;
  watched?: boolean;
  showActions?: boolean;
}) {
  const done = Boolean(video.completed_at);
  return (
    <article className={`vcard${done ? " watched" : ""}`}>
      <Link href={`/watch/${video.id}`} className="thumb" aria-label={`Watch ${video.title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={video.thumbnail ?? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt="" loading="lazy" />
        {video.duration_sec ? <span className="dur">{formatDuration(video.duration_sec)}</span> : null}
        {done ? <span className="done-badge">✓ Done</span> : watched ? <span className="done-badge">Started</span> : null}
      </Link>
      <div className="body">
        <Link href={`/watch/${video.id}`} className="title">
          {video.title}
        </Link>
        <div className="small muted">
          {video.channel_title}
          {video.published_at ? ` · ${timeAgo(video.published_at)}` : ""}
        </div>
        {video.score_reason ? <div className="why">{video.score_reason}</div> : null}
        <div className="foot">
          <div className="row">
            {video.score != null ? <span className="score" title="Growth score (0-10)">{video.score.toFixed(0)}</span> : null}
            {goalName ? <span className="pill accent">{goalName}</span> : null}
          </div>
          {showActions ? <CardActions videoId={video.id} channelId={video.channel_id} channelTitle={video.channel_title} watchLater={Boolean(video.watch_later)} /> : null}
        </div>
      </div>
    </article>
  );
}
