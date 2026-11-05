import { all } from "@/lib/db";
import { getStats } from "@/lib/learn";
import { hasAi } from "@/lib/settings";
import type { Reflection } from "@/lib/ai";
import type { Action } from "@/lib/types";
import StatsView from "@/components/StatsView";
import ActionList from "@/components/ActionList";
import ReflectionButton from "@/components/ReflectionButton";

export const dynamic = "force-dynamic";

export default function ProgressPage() {
  const stats = getStats();
  const actions = all<Action>("SELECT * FROM actions ORDER BY done, created_at DESC LIMIT 60");
  const titles = Object.fromEntries(
    all<{ id: string; title: string }>("SELECT id, title FROM videos WHERE id IN (SELECT video_id FROM actions WHERE video_id IS NOT NULL)").map((r) => [r.id, r.title]),
  );
  const reflections = all<{ id: number; week_start: string; content: string }>("SELECT * FROM reflections ORDER BY created_at DESC LIMIT 12");

  return (
    <div className="learn-page">
      <h1>Progress</h1>
      <StatsView stats={stats} privateView />

      <div className="progress-lower">
        <section>
          <h2>Action steps</h2>
          <p className="small muted">Watching is only half of it. These are the things you committed to doing.</p>
          <ActionList actions={actions} videoTitles={titles} allowAdd />
        </section>

        <section>
          <h2>Weekly reflection</h2>
          <p className="small muted">What you learned this week, what you applied and what to try next.</p>
          {hasAi() ? <ReflectionButton /> : <p className="small muted">Add an <code>ANTHROPIC_API_KEY</code> to get an AI-written weekly reflection.</p>}
          {reflections.map((r) => {
        const c = JSON.parse(r.content) as Reflection;
        return (
          <div key={r.id} className="card">
            <div className="small muted">Week of {r.week_start}</div>
            <h3 style={{ marginTop: 4 }}>{c.headline}</h3>
            {c.learned.length ? (<><strong className="small">What you learned</strong><ul className="clean">{c.learned.map((x, i) => <li key={i}>{x}</li>)}</ul></>) : null}
            {c.applied.length ? (<><strong className="small">What you put into practice</strong><ul className="clean">{c.applied.map((x, i) => <li key={i}>{x}</li>)}</ul></>) : null}
            <strong className="small">Patterns</strong>
            <p>{c.patterns}</p>
            <strong className="small">For next week</strong>
            <ul className="clean">{c.next_week.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        );
          })}
        </section>
      </div>
    </div>
  );
}
