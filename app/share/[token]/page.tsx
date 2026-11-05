import { notFound } from "next/navigation";
import { all } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getStats } from "@/lib/learn";
import type { Goal } from "@/lib/types";
import StatsView from "@/components/StatsView";

export const dynamic = "force-dynamic";

/** Read-only page for an accountability buddy. Shows progress, never notes or intents. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token !== getSettings().shareToken) notFound();
  const goals = all<Goal>("SELECT * FROM goals ORDER BY id");
  const done = all<{ text: string; done_at: string }>("SELECT text, done_at FROM actions WHERE done = 1 ORDER BY done_at DESC LIMIT 15");

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <h1>A friend&apos;s growth progress</h1>
      <p className="muted">They shared this so you can keep them accountable. Cheer them on, or nudge them if the streak breaks.</p>
      <div className="card">
        <h3>Their goals</h3>
        <div className="row">{goals.map((g) => <span key={g.id} className="pill accent">{g.name}</span>)}</div>
      </div>
      <StatsView stats={getStats()} privateView={false} />
      <div className="card">
        <h3>Recently completed action steps</h3>
        {done.length ? <ul className="clean">{done.map((a, i) => <li key={i}>{a.text} <span className="small muted">({a.done_at.slice(0, 10)})</span></li>)}</ul> : <p className="small muted">None yet.</p>}
      </div>
    </div>
  );
}
