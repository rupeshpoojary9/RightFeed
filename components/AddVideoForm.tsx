"use client";
import { useActionState, useEffect, useRef } from "react";
import { addVideoByLink } from "@/app/actions";

export default function AddVideoForm({ pathId, sectionId, label }: { pathId: number; sectionId: number | null; label: string }) {
  const [state, action, pending] = useActionState(addVideoByLink, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form action={action} ref={form} className="add-video">
      <input type="hidden" name="path_id" value={pathId} />
      <input type="hidden" name="section_id" value={sectionId ?? ""} />
      <div className="inline-form">
        <input name="video" required aria-label={label} placeholder="Paste a YouTube link" />
        <button disabled={pending}>{pending ? "Adding…" : "Add video"}</button>
      </div>
      {state && !state.ok ? <p className="error small" role="alert">{state.error}</p> : null}
    </form>
  );
}
