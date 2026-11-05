import { addDays, formatMinutes, today } from "@/lib/dates";
import type { Stats } from "@/lib/learn";

/** Shared between the private Progress page and the public buddy page. */
export default function StatsView({ stats, privateView }: { stats: Stats; privateView: boolean }) {
  const now = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(now, i - 13));
  const byDay = new Map(stats.perDay.map((d) => [d.day, d.seconds]));
  const maxDay = Math.max(1800, ...stats.perDay.map((d) => d.seconds));
  const maxGoal = Math.max(1, ...stats.perGoal.map((g) => g.seconds));
  const watched = stats.perDay.reduce((n, d) => n + d.seconds, 0);

  return (
    <div className="progress">
      <section className="streak-panel" aria-label="Your streak and last 14 days">
        <div className="streak">
          <span className="streak-value">{stats.streak}</span>
          <span>day streak</span>
          {privateView ? <span className="small muted">{stats.streak ? "Keep it going today." : "Spend a minute learning today to start one."}</span> : null}
        </div>
        <div className="fortnight">
          <div className="fortnight-head">
            <h2>Last 14 days</h2>
            <span className="small muted">{watched ? formatMinutes(watched) : "Nothing watched yet"}</span>
          </div>
          <ol className="days" aria-label="Minutes watched per day">
            {days.map((d) => {
              const s = byDay.get(d) ?? 0;
              const fill = s ? Math.max(25, Math.round((100 * s) / maxDay)) : 0;
              const minutes = Math.round(s / 60);
              return (
                <li key={d} className="day" data-today={d === now || undefined} data-strong={fill >= 60 || undefined} style={{ "--fill": `${fill}%` } as React.CSSProperties} title={`${d}: ${minutes} min`}>
                  <span className="day-minutes">{s ? minutes : ""}<span className="visually-hidden">{` ${minutes} minutes on ${d}`}</span></span>
                  <span className="day-date">{Number(d.slice(8))}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <dl className="facts">
        <Fact value={stats.completed7} label="Finished this week" />
        <Fact value={stats.completed} label="Finished in total" />
        <Fact value={formatMinutes(stats.totalSeconds)} label="Focused watching" />
        <Fact value={stats.actionsDone} label="Actions done" />
        {privateView ? <Fact value={stats.actionsOpen} label="Actions open" /> : null}
        <Fact value={stats.quizPct != null ? `${stats.quizPct}%` : "None yet"} label="Quiz accuracy" />
        {privateView ? <Fact value={`${stats.dueCards} of ${stats.totalCards}`} label="Cards due" /> : null}
      </dl>

      <section className="goals-time">
        <h2>Time per goal</h2>
        <p className="small muted">Last 30 days</p>
        {stats.perGoal.length ? (
          stats.perGoal.map((g) => (
            <div key={g.goal ?? "none"} className="hbar">
              <span>{g.goal ?? "Unassigned"}</span>
              <div className="track"><span style={{ width: `${(100 * g.seconds) / maxGoal}%` }} /></div>
              <span className="small muted">{g.seconds < 60 ? "Under 1 min" : formatMinutes(g.seconds)}</span>
            </div>
          ))
        ) : (
          <p className="small muted">No watching yet.</p>
        )}
      </section>
    </div>
  );
}

function Fact({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
