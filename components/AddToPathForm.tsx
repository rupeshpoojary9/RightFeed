"use client";
import { useActionState } from "react";
import Link from "next/link";
import { addFeedVideoToPath } from "@/app/actions";

export default function AddToPathForm({ video, pathId, pathTitle, sections }: { video: string; pathId: number; pathTitle: string; sections: { id: number; title: string }[] }) {
  const [state, action, pending] = useActionState(addFeedVideoToPath, null);
  if (state?.ok) return <p className="small">Added to <Link href={`/paths/${pathId}`}>{pathTitle}</Link></p>;

  return (
    <form action={action}>
      <input type="hidden" name="video" value={video} />
      <input type="hidden" name="path_id" value={pathId} />
      <h2 className="add-path-title">{pathTitle}</h2>
      <div className="row">
        {sections.length ? (
          sections.map((s) => <button key={s.id} name="section_id" value={s.id} disabled={pending}>{s.title}</button>)
        ) : (
          <button name="section_id" value="" disabled={pending}>Add here</button>
        )}
      </div>
      {state && !state.ok ? <p className="error small" role="alert">{state.error}</p> : null}
    </form>
  );
}
