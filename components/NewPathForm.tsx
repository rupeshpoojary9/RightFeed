"use client";
import { useActionState, useState } from "react";
import { createOwnPath } from "@/app/actions";
import { parseSections } from "@/lib/paths";

export default function NewPathForm() {
  const [state, action, pending] = useActionState(createOwnPath, null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [structure, setStructure] = useState("");
  const sections = parseSections(structure);

  return (
    <div className="path-builder">
      <form action={action} className="new-path">
        <div className="field">
          <label htmlFor="path-title">Name</label>
          <input id="path-title" name="title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Learn system design" />
        </div>
        <div className="field">
          <label htmlFor="path-description">Description</label>
          <textarea id="path-description" name="description" maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What you want to be able to do by the end" />
        </div>
        <div className="field">
          <label htmlFor="path-structure">Structure</label>
          <textarea id="path-structure" name="structure" value={structure} onChange={(e) => setStructure(e.target.value)} placeholder={"Basics\nCore ideas\nPractice"} />
          <div className="hint">One section per line. You can skip this and add sections later.</div>
        </div>
        {state && !state.ok ? <p className="error small">{state.error}</p> : null}
        <button className="primary" disabled={pending}>{pending ? "Creating…" : "Create path"}</button>
      </form>

      <aside className="path-preview" aria-label="Preview of your path">
        <h2 data-empty={!title.trim() || undefined}>{title.trim() || "Your path"}</h2>
        {description.trim() ? <p className="small muted">{description.trim()}</p> : null}
        {sections.length ? (
          <ol>
            {sections.map((s, i) => (
              <li key={s}>
                <span className="preview-no">{i + 1}</span>
                <span className="grow">{s}</span>
                <span className="small muted">No videos yet</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="small muted">Your sections show up here as you type them.</p>
        )}
      </aside>
    </div>
  );
}
