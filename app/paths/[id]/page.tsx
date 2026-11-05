import Link from "next/link";
import { notFound } from "next/navigation";
import { get } from "@/lib/db";
import {
  addPathSection,
  deletePath,
  deletePathSection,
  movePathItem,
  movePathSection,
  removeFromPath,
  renamePathSection,
  updatePath,
} from "@/app/actions";
import { formatDuration, formatMinutes } from "@/lib/dates";
import { pathOutline } from "@/lib/learn";
import AddVideoForm from "@/components/AddVideoForm";
import DeletePathButton from "@/components/DeletePathButton";
import Icon from "@/components/Icons";

export const dynamic = "force-dynamic";

function MoveButtons({ action, name, value, pathId, label, first, last }: {
  action: (fd: FormData) => Promise<void>;
  name: string;
  value: string | number;
  pathId: number;
  label: string;
  first: boolean;
  last: boolean;
}) {
  return (
    <form action={action} className="move">
      <input type="hidden" name="path_id" value={pathId} />
      <input type="hidden" name={name} value={value} />
      <button className="iconbtn" name="direction" value="up" disabled={first} aria-label={`Move ${label} up`}><Icon name="up-arrow" size={20} /></button>
      <button className="iconbtn flip" name="direction" value="down" disabled={last} aria-label={`Move ${label} down`}><Icon name="up-arrow" size={20} /></button>
    </form>
  );
}

export default async function PathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = get<{ id: number; title: string; description: string; goal: string | null }>(
    "SELECT p.id, p.title, p.description, g.name AS goal FROM paths p LEFT JOIN goals g ON g.id = p.goal_id WHERE p.id = ?",
    Number(id),
  );
  if (!path) notFound();
  const groups = pathOutline(path.id);
  const steps = groups.flatMap((g) => g.steps);
  const done = steps.filter((s) => s.completed_at).length;
  const next = steps.find((s) => !s.completed_at);
  const cover = next ?? steps[0];
  const seconds = steps.reduce((n, s) => n + (s.duration_sec ?? 0), 0);
  const sections = groups.filter((g) => g.section);

  return (
    <div className="course">
      <aside className="course-panel">
        <Link href="/paths" className="small muted">All paths</Link>
        {cover ? (
          <Link href={`/watch/${cover.id}`} className="thumb" aria-label={next ? `Continue with ${next.title}` : `Watch ${cover.title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.thumbnail ?? `https://i.ytimg.com/vi/${cover.id}/hqdefault.jpg`} alt="" />
          </Link>
        ) : null}
        <h1>{path.title}</h1>
        <div className="vline">
          {path.goal ? <span>{path.goal}</span> : null}
          <span>{steps.length === 1 ? "1 video" : `${steps.length} videos`}</span>
          {seconds ? <span>{formatMinutes(seconds)}</span> : null}
        </div>
        {steps.length ? (
          <div className="course-progress">
            <div className="track" aria-hidden="true"><span style={{ width: `${(100 * done) / steps.length}%` }} /></div>
            <span className="small muted">{done} of {steps.length} done</span>
          </div>
        ) : null}
        {next ? (
          <Link href={`/watch/${next.id}`} className="btn primary course-cta">{done ? "Continue" : "Start"}: step {next.no}</Link>
        ) : steps.length ? (
          <span className="pill">Path complete</span>
        ) : null}
        {path.description ? <p className="small muted">{path.description}</p> : null}
        <details className="edit-path">
          <summary className="small">Edit name and description</summary>
          <form action={updatePath}>
            <input type="hidden" name="id" value={path.id} />
            <div className="field">
              <label htmlFor="edit-title">Name</label>
              <input id="edit-title" name="title" required maxLength={120} defaultValue={path.title} />
            </div>
            <div className="field">
              <label htmlFor="edit-description">Description</label>
              <textarea id="edit-description" name="description" maxLength={600} defaultValue={path.description} />
            </div>
            <button>Save</button>
          </form>
        </details>
        <form action={deletePath}>
          <input type="hidden" name="id" value={path.id} />
          <DeletePathButton />
        </form>
      </aside>

      <div className="outline">
        {!steps.length ? <p className="muted">No videos yet. Paste a link below, or use Add to path on any video.</p> : null}

        {groups.map((group, g) => (
          <section key={group.section?.id ?? "loose"} className="path-section">
            {group.section ? (
              <header className="section-head">
                <h2>{group.section.title}</h2>
                <MoveButtons action={movePathSection} name="id" value={group.section.id} pathId={path.id} label={group.section.title} first={sections[0] === group} last={sections[sections.length - 1] === group} />
                <details className="section-edit">
                  <summary className="small">Edit</summary>
                  <form action={renamePathSection} className="inline-form">
                    <input type="hidden" name="id" value={group.section.id} />
                    <input type="hidden" name="path_id" value={path.id} />
                    <input name="title" required maxLength={120} defaultValue={group.section.title} aria-label="Section name" />
                    <button>Rename</button>
                    <button formAction={deletePathSection} className="ghost danger">Delete section</button>
                  </form>
                </details>
              </header>
            ) : null}

            <ol className="steps">
              {group.steps.map((s, i) => {
                const played = s.completed_at ? 1 : s.duration_sec ? Math.min(1, (s.played ?? 0) / s.duration_sec) : 0;
                const isNext = s.id === next?.id;
                return (
                  <li key={s.id} className="step-item">
                    <Link href={`/watch/${s.id}`} className="step" data-next={isNext || undefined}>
                      <span className="step-no">
                        {s.completed_at ? <Icon name="check" size={20} /> : s.no}
                        <span className="visually-hidden">{s.completed_at ? ` Step ${s.no}, done` : ""}</span>
                      </span>
                      <span className="thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.thumbnail ?? `https://i.ytimg.com/vi/${s.id}/mqdefault.jpg`} alt="" loading="lazy" />
                        {s.duration_sec ? <span className="dur">{formatDuration(s.duration_sec)}</span> : null}
                        {played > 0 ? <span className="watched-bar"><span style={{ transform: `scaleX(${played})` }} /></span> : null}
                      </span>
                      <span className="step-head">
                        <span className="vtitle">{s.title}</span>
                        <span className="vline">
                          {isNext ? <strong className="step-next">Up next</strong> : null}
                          <span>{s.channel_title}</span>
                        </span>
                      </span>
                      {s.why ? <span className="step-why">{s.why}</span> : null}
                    </Link>
                    <div className="step-tools">
                      <MoveButtons action={movePathItem} name="video" value={s.id} pathId={path.id} label={s.title} first={i === 0} last={i === group.steps.length - 1} />
                      <form action={removeFromPath}>
                        <input type="hidden" name="path_id" value={path.id} />
                        <input type="hidden" name="video" value={s.id} />
                        <button className="iconbtn" aria-label={`Remove ${s.title} from this path`}><Icon name="close" size={20} /></button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ol>

            <AddVideoForm pathId={path.id} sectionId={group.section?.id ?? null} label={group.section ? `Add a video to ${group.section.title}` : "Add a video"} key={`add-${group.section?.id ?? g}`} />
          </section>
        ))}

        {!groups.length ? <AddVideoForm pathId={path.id} sectionId={null} label="Add a video" /> : null}

        <form action={addPathSection} className="inline-form add-section">
          <input type="hidden" name="path_id" value={path.id} />
          <input name="title" required maxLength={120} placeholder="New section name" aria-label="New section name" />
          <button>Add section</button>
        </form>
      </div>
    </div>
  );
}
