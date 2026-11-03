import { addDays, formatMinutes, today } from "@/lib/dates";
import type { Stats } from "@/lib/learn";

/** Shared between the private Progress page and the public buddy page. */
export default function StatsView({ stats, privateView }: { stats: Stats; privateView: boolean }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13));
  const byDay = new Map(stats.perDay.map((d) => [d.day, d.seconds]));
  const maxDay = Math.max(60, ...stats.perDay.map((d) => d.seconds));
  const maxGoal = Math.max(1, ...stats.perGoal.map((g) => g.seconds));

  return (
    <div className="stack">
      <div className="stats">
        <Stat value={`${stats.streak} 🔥`} label="day streak" />
        <Stat value={stats.completed7} label="videos finished this week" />
        <Stat value={stats.completed} label="videos finished in total" />
        <Stat value={formatMinutes(stats.totalSeconds)} label="total focused watching" />
        <Stat value={stats.actionsDone} label="action steps done" />
        {privateView ? <Stat value={stats.actionsOpen} label="action steps open" /> : null}
        <Stat value={stats.quizPct != null ? `${stats.quizPct}%` : "–"} label="quiz accuracy" />
        {privateView ? <Stat value={`${stats.dueCards}/${stats.totalCards}`} label="flashcards due / total" /> : null}
      </div>

      <div className="card">
        <h3>Last 14 days</h3>
        <div className="bars" role="img" aria-label="Minutes watched per day over the last 14 days">
          {days.map((d) => {
            const s = byDay.get(d) ?? 0;
            return <div key={d} className="bar" title={`${d}: ${Math.round(s / 60)} min`} style={{ height: `${(100 * s) / maxDay}%`, opacity: s ? 1 : 0.25 }} />;
          })}
        </div>
        <div className="bars-labels">
          {days.map((d) => <span key={d}>{Number(d.slice(8))}</span>)}
        </div>
      </div>

      <div className="card">
        <h3>Time per goal (last 30 days)</h3>
        {stats.perGoal.length ? (
          stats.perGoal.map((g) => (
            <div key={g.goal ?? "none"} className="hbar">
              <span>{g.goal ?? "Unassigned"}</span>
              <div className="meter"><span style={{ width: `${(100 * g.seconds) / maxGoal}%` }} /></div>
              <span className="small muted">{formatMinutes(g.seconds)}</span>
            </div>
          ))
        ) : (
          <p className="small muted">No watching yet.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="card stat" style={{ marginTop: 0 }}>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}
