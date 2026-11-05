"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { addAction, deleteAction, toggleAction } from "@/app/actions";
import type { Action } from "@/lib/types";
import Icon from "./Icons";

export default function ActionList({
  actions,
  videoTitles,
  allowAdd = false,
}: {
  actions: Action[];
  videoTitles?: Record<string, string>;
  allowAdd?: boolean;
}) {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");

  return (
    <div className="list">
      {allowAdd ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text;
            setText("");
            start(async () => {
              await addAction(null, t);
            });
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an action step" aria-label="New action" />
          <button className="primary" disabled={pending || !text.trim()}>Add</button>
        </form>
      ) : null}
      {actions.map((a) => (
        <div key={a.id} className="list-row" style={{ alignItems: "center" }}>
          <input
            type="checkbox"
            checked={Boolean(a.done)}
            disabled={pending}
            onChange={() => start(() => toggleAction(a.id))}
            style={{ width: 18, height: 18, flexShrink: 0 }}
            aria-label={`Mark "${a.text}" ${a.done ? "not done" : "done"}`}
          />
          <div className="grow">
            <div style={{ textDecoration: a.done ? "line-through" : undefined }}>{a.text}</div>
            {a.video_id ? (
              <Link href={`/watch/${a.video_id}`} className="small muted">
                from {videoTitles?.[a.video_id] ?? "a video"}
              </Link>
            ) : null}
          </div>
          <button className="ghost small" title="Delete" aria-label="Delete action" disabled={pending} onClick={() => start(() => deleteAction(a.id))}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
