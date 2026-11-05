"use client";
import { useActionState } from "react";
import { addChannel, addFeed } from "@/app/actions";

export function AddChannelForm() {
  const [state, action, pending] = useActionState(addChannel, null);
  return (
    <form action={action}>
      <label htmlFor="channel">Add a channel you trust</label>
      <div className="inline-form">
        <input id="channel" name="channel" placeholder="https://www.youtube.com/@3blue1brown or @hubermanlab" required />
        <button className="primary" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
      </div>
      {state ? <p className="small" style={{ marginTop: 8, color: state.ok ? "var(--color-success)" : "var(--color-error)" }}>{state.ok ? `Added ${state.data}` : state.error}</p> : null}
    </form>
  );
}

export function AddFeedForm() {
  const [state, action, pending] = useActionState(addFeed, null);
  return (
    <form action={action}>
      <label htmlFor="feed">Add a blog, newsletter or podcast (RSS feed URL)</label>
      <div className="inline-form">
        <input id="feed" name="url" type="url" placeholder="https://example.com/feed.xml" required />
        <button className="primary" disabled={pending}>{pending ? "Checking…" : "Add"}</button>
      </div>
      {state ? <p className="small" style={{ marginTop: 8, color: state.ok ? "var(--color-success)" : "var(--color-error)" }}>{state.ok ? `Added ${state.data}` : state.error}</p> : null}
    </form>
  );
}
