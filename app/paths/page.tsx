import Link from "next/link";
import { all } from "@/lib/db";
import { hasAi } from "@/lib/settings";
import { formatMinutes } from "@/lib/dates";
import type { Goal } from "@/lib/types";
import CreatePathForm from "@/components/CreatePathForm";
import NewPathForm from "@/components/NewPathForm";
import Icon from "@/components/Icons";

export const dynamic = "force-dynamic";

type PathRow = { id: number; title: string; description: string; goal: string | null; total: number; done: number; seconds: number | null; cover: string | null; cover_id: string | null };

export default async function PathsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: creating } = await searchParams;
  const goals = all<Goal>("SELECT * FROM goals ORDER BY name");
  // The cover is the next unfinished step, so each path shows where you left off.
  const paths = all<PathRow>(
    `SELECT p.id, p.title, p.description, g.name AS goal,
       (SELECT COUNT(*) FROM path_items i WHERE i.path_id = p.id) AS total,
       (SELECT COUNT(*) FROM path_items i JOIN videos v ON v.id = i.video_id WHERE i.path_id = p.id AND v.completed_at IS NOT NULL) AS done,
       (SELECT SUM(v.duration_sec) FROM path_items i JOIN videos v ON v.id = i.video_id WHERE i.path_id = p.id) AS seconds,
       (SELECT v.thumbnail FROM path_items i JOIN videos v ON v.id = i.video_id WHERE i.path_id = p.id ORDER BY v.completed_at IS NOT NULL, i.position LIMIT 1) AS cover,
       (SELECT v.id FROM path_items i JOIN videos v ON v.id = i.video_id WHERE i.path_id = p.id ORDER BY v.completed_at IS NOT NULL, i.position LIMIT 1) AS cover_id
     FROM paths p LEFT JOIN goals g ON g.id = p.goal_id ORDER BY p.created_at DESC`,
  );

  return (
    <div className="learn-page">
      <div className="paths-head">
        <div>
          <h1>Learning paths</h1>
          <p className="muted">Your own short courses: name one, lay out its sections and add videos in the order you want to watch them.</p>
        </div>
        {paths.length && !creating ? <Link href="/paths?new=1" className="btn primary">New path</Link> : null}
        {paths.length && creating ? <Link href="/paths" className="btn">Cancel</Link> : null}
      </div>

      {!paths.length || creating ? (
        <section className="new-path-panel" aria-label="Create a path">
          <NewPathForm />
          {hasAi() && goals.length ? (
            <details className="ai-path">
              <summary>Or let AI build one from a goal</summary>
              <CreatePathForm goals={goals.map((g) => ({ id: g.id, name: g.name }))} />
            </details>
          ) : null}
        </section>
      ) : null}

      {paths.length ? (
        <div className="grid">
          {paths.map((p) => (
            <Link key={p.id} href={`/paths/${p.id}`} className="playlist">
              <span className="playlist-cover">
                <span className="thumb">
                  {p.cover_id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover ?? `https://i.ytimg.com/vi/${p.cover_id}/hqdefault.jpg`} alt="" />
                  ) : (
                    <span className="thumb-empty"><Icon name="path" size={32} /></span>
                  )}
                  <span className="count">{p.total === 1 ? "1 video" : `${p.total} videos`}</span>
                  <span className="watched-bar"><span style={{ transform: `scaleX(${p.total ? p.done / p.total : 0})` }} /></span>
                </span>
              </span>
              <span className="vtitle">{p.title}</span>
              <span className="vline">
                {p.goal ? <span>{p.goal}</span> : null}
                <span>{p.done} of {p.total} done</span>
                {p.seconds ? <span>{formatMinutes(p.seconds)}</span> : null}
              </span>
              <span className="vwhy">{p.description}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
