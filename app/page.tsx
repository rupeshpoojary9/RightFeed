import Link from "next/link";
import { redirect } from "next/navigation";
import { all, get } from "@/lib/db";
import { getSettings, hasAi, hasYouTubeKey } from "@/lib/settings";
import { budgetStatus, getDailyPicks, maybeAutoRefresh, isRefreshing } from "@/lib/ingest";
import { formatMinutes, today } from "@/lib/dates";
import type { Action, Goal, Reading } from "@/lib/types";
import VideoCard from "@/components/VideoCard";
import RefreshButton from "@/components/RefreshButton";
import ActionList from "@/components/ActionList";
import ReadingDone from "@/components/ReadingDone";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const { goal } = await searchParams;
  const s = getSettings();
  if (!s.onboarded) redirect("/welcome");
  maybeAutoRefresh();

  const picks = getDailyPicks();
  const goals = all<Goal>("SELECT * FROM goals");
  const goalName = new Map(goals.map((g) => [g.id, g.name]));
  const startedToday = new Set(all<{ video_id: string }>("SELECT DISTINCT video_id FROM watch_sessions WHERE day = ?", today()).map((r) => r.video_id));
  const played = new Map(all<{ video_id: string; s: number }>("SELECT video_id, SUM(seconds) AS s FROM watch_sessions GROUP BY video_id").map((r) => [r.video_id, r.s]));
  const goalId = goal ? Number(goal) : null;
  const shown = goalId ? picks.filter((p) => p.goal_id === goalId) : picks;
  const b = budgetStatus();
  const pct = b.budget ? Math.min(100, Math.round((100 * b.used) / b.budget)) : 0;
  const remainingPicks = picks.filter((p) => !p.completed_at);
  const doneForToday = picks.length > 0 && remainingPicks.length === 0;
  const dueCards = get<{ n: number }>("SELECT COUNT(*) AS n FROM flashcards WHERE due_day <= ?", today())?.n ?? 0;
  const openActions = all<Action>("SELECT * FROM actions WHERE done = 0 ORDER BY created_at DESC LIMIT 5");
  const readings = all<Reading>(
    "SELECT * FROM readings WHERE status = 'scored' AND done = 0 AND score >= ? ORDER BY score DESC, published_at DESC LIMIT 4",
    s.threshold,
  );
  const pendingCount = get<{ n: number }>("SELECT COUNT(*) AS n FROM videos WHERE status = 'new'")?.n ?? 0;
  const sourcesCount = get<{ n: number }>("SELECT COUNT(*) AS n FROM sources WHERE blocked = 0")?.n ?? 0;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>Today</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            {picks.length
              ? `${remainingPicks.length} of ${picks.length} picks left. Chosen for your goals; nothing else.`
              : "Your picks for today will appear here."}
          </p>
        </div>
        <RefreshButton />
      </div>

      {goals.length ? (
        <nav className="chips-bar" aria-label="Filter by goal">
          <Link href="/" className="chip" aria-current={goalId ? undefined : "true"}>All</Link>
          {goals.map((g) => (
            <Link key={g.id} href={`/?goal=${g.id}`} className="chip" aria-current={goalId === g.id ? "true" : undefined}>{g.name}</Link>
          ))}
        </nav>
      ) : null}

      {!hasAi() || !hasYouTubeKey() ? (
        <div className="banner small">
          {!hasAi() ? <>Running with <b>basic scoring</b>. Add <code>ANTHROPIC_API_KEY</code> to enable the AI judge, summaries, quizzes and paths. </> : null}
          {!hasYouTubeKey() ? <>No <code>YOUTUBE_API_KEY</code>: only your channels are used (no goal search) and Shorts are detected less reliably. </> : null}
          <Link href="/settings">Setup help</Link>
        </div>
      ) : null}

      <div className="scrubber">
        <strong>Daily budget</strong>
        {b.budget ? (
          <div className="track" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
            <i style={{ left: `${pct}%` }} />
          </div>
        ) : <span />}
        <span className="muted">{b.budget ? `${formatMinutes(b.used)} of ${formatMinutes(b.budget)} used` : "No limit set"}</span>
      </div>
      {b.locked ? <p className="small">You&apos;ve used today&apos;s budget. Time to apply what you learned. See you tomorrow.</p> : null}

      {dueCards > 0 ? (
        <div className="banner spread">
          <span>{dueCards} flashcard{dueCards === 1 ? "" : "s"} due for review. Takes about {Math.max(1, Math.round(dueCards / 4))} min.</span>
          <Link href="/review" className="btn primary">Review now</Link>
        </div>
      ) : null}

      {doneForToday ? (
        <div className="card empty">
          <h2>You&apos;re done for today</h2>
          <p>You finished all {picks.length} picks. New ones arrive tomorrow. Now put something into practice: one action beats ten more videos.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/progress" className="btn primary">See your progress</Link>
            <Link href="/library" className="btn">Watch later list</Link>
          </div>
        </div>
      ) : null}

      {shown.length ? (
        <section>
          <div className="grid">
            {shown.map((v, i) => (
              <VideoCard
                key={v.id}
                video={v}
                goalName={v.goal_id ? goalName.get(v.goal_id) : null}
                watched={startedToday.has(v.id)}
                progress={v.duration_sec ? Math.min(1, (played.get(v.id) ?? 0) / v.duration_sec) : 0}
                eager={i < 4}
                pick
              />
            ))}
          </div>
        </section>
      ) : picks.length ? (
        <div className="card empty">
          <h2>No picks for this goal today</h2>
          <p><Link href="/">Show all picks</Link></p>
        </div>
      ) : (
        <div className="card empty">
          <h2>{isRefreshing() || pendingCount ? "Finding good videos…" : "Nothing here yet"}</h2>
          {sourcesCount === 0 && !hasYouTubeKey() ? (
            <p>Add a few channels you trust in <Link href="/settings">Settings</Link>, then refresh.</p>
          ) : isRefreshing() ? (
            <p>Your feed is being refreshed in the background. Reload in a minute.</p>
          ) : (
            <p>Press “Refresh feed” to fetch and judge new videos. If nothing passes, try lowering the score threshold in Settings.</p>
          )}
        </div>
      )}

      {openActions.length ? (
        <section>
          <h2>Your action steps</h2>
          <ActionList actions={openActions} />
        </section>
      ) : null}

      {readings.length ? (
        <section>
          <h2>Worth reading or listening to</h2>
          <div className="list">
            {readings.map((r) => (
              <div key={r.id} className="list-row">
                <div className="grow">
                  <a href={r.link} target="_blank" rel="noreferrer" style={{ fontWeight: 500 }}>{r.title}</a>
                  <div className="vline">
                    <span>{r.kind === "podcast" ? "Podcast" : "Article"}</span>
                    <span>{r.source_title}</span>
                    {r.score != null ? <span>Score {r.score.toFixed(0)}</span> : null}
                    {r.goal_id && goalName.get(r.goal_id) ? <span>{goalName.get(r.goal_id)}</span> : null}
                  </div>
                  {r.score_reason ? <div className="small muted">{r.score_reason}</div> : null}
                </div>
                <ReadingDone id={r.id} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
