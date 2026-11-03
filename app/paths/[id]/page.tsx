import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { deletePath } from "@/app/actions";
import { formatDuration } from "@/lib/dates";
import type { Video } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = get<{ id: number; title: string; description: string; goal: string | null }>(
    "SELECT p.id, p.title, p.description, g.name AS goal FROM paths p LEFT JOIN goals g ON g.id = p.goal_id WHERE p.id = ?",
    Number(id),
  );
  if (!path) notFound();
  const steps = all<Video & { why: string; position: number }>(
    "SELECT v.*, i.why, i.position FROM path_items i JOIN videos v ON v.id = i.video_id WHERE i.path_id = ? ORDER BY i.position",
    path.id,
  );
  const done = steps.filter((s) => s.completed_at).length;
  const next = steps.find((s) => !s.completed_at);

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <Link href="/paths" className="small muted">← All paths</Link>
      <div className="spread">
        <div>
          <h1>{path.title}</h1>
          {path.goal ? <span className="pill accent">{path.goal}</span> : null}
        </div>
        {next ? <Link href={`/watch/${next.id}`} className="btn primary">▶ Continue: step {next.position + 1}</Link> : <span className="pill accent">Path complete 🎉</span>}
      </div>
      <p className="muted">{path.description}</p>
      <div className="meter"><span style={{ width: `${steps.length ? (100 * done) / steps.length : 0}%` }} /></div>
      <div className="small muted">{done} of {steps.length} done</div>

      <ol className="list" style={{ listStyle: "none", padding: 0 }}>
        {steps.map((s) => (
          <li key={s.id}>
            <Link href={`/watch/${s.id}`} className="list-row" style={{ textDecoration: "none", opacity: s.completed_at ? 0.65 : 1 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.thumbnail ?? `https://i.ytimg.com/vi/${s.id}/mqdefault.jpg`} alt="" />
              <div className="grow">
                <div className="small muted">Step {s.position + 1}{s.completed_at ? " · ✓ done" : ""}{s.duration_sec ? ` · ${formatDuration(s.duration_sec)}` : ""}</div>
                <div style={{ fontWeight: 600 }}>{s.title}</div>
                <div className="small muted">{s.channel_title}</div>
                <div className="small">{s.why}</div>
              </div>
            </Link>
          </li>
        ))}
      </ol>

      <form action={deletePath}>
        <input type="hidden" name="id" value={path.id} />
        <button className="ghost danger small">Delete path</button>
      </form>
    </div>
  );
}
