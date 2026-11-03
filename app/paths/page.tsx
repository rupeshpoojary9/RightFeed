import Link from "next/link";
import { all } from "@/lib/db";
import { hasAi } from "@/lib/settings";
import type { Goal } from "@/lib/types";
import CreatePathForm from "@/components/CreatePathForm";

export const dynamic = "force-dynamic";

export default function PathsPage() {
  const goals = all<Goal>("SELECT * FROM goals ORDER BY name");
  const paths = all<{ id: number; title: string; description: string; goal: string | null; total: number; done: number }>(
    `SELECT p.id, p.title, p.description, g.name AS goal,
       (SELECT COUNT(*) FROM path_items i WHERE i.path_id = p.id) AS total,
       (SELECT COUNT(*) FROM path_items i JOIN videos v ON v.id = i.video_id WHERE i.path_id = p.id AND v.completed_at IS NOT NULL) AS done
     FROM paths p LEFT JOIN goals g ON g.id = p.goal_id ORDER BY p.created_at DESC`,
  );

  return (
    <div className="stack">
      <h1>Learning paths</h1>
      <p className="muted">A path is a short course: videos picked from your feed and ordered from basics to advanced, so you learn step by step instead of jumping around.</p>

      <div className="card">
        <h3>Build a new path</h3>
        {hasAi() ? (
          goals.length ? <CreatePathForm goals={goals.map((g) => ({ id: g.id, name: g.name }))} /> : <p className="small muted">Add a goal in Settings first.</p>
        ) : (
          <p className="small muted">Learning paths are designed by the AI. Add an <code>ANTHROPIC_API_KEY</code> to enable them.</p>
        )}
      </div>

      {paths.length ? (
        <div className="grid">
          {paths.map((p) => (
            <Link key={p.id} href={`/paths/${p.id}`} className="card" style={{ textDecoration: "none", marginTop: 0 }}>
              <div className="spread">
                <strong>{p.title}</strong>
                {p.goal ? <span className="pill accent">{p.goal}</span> : null}
              </div>
              <p className="small muted" style={{ marginTop: 6 }}>{p.description}</p>
              <div className="meter"><span style={{ width: `${p.total ? (100 * p.done) / p.total : 0}%` }} /></div>
              <div className="small muted" style={{ marginTop: 4 }}>{p.done} of {p.total} done</div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted">No paths yet.</p>
      )}
    </div>
  );
}
