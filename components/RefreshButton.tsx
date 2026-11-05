"use client";
import { useState, useTransition } from "react";
import { refreshNow, rejudgeAll } from "@/app/actions";

export default function RefreshButton({ label = "Refresh feed", rejudge = false }: { label?: string; rejudge?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <span className="row">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await (rejudge ? rejudgeAll() : refreshNow());
            if (!r.ok) setMsg(`Failed: ${r.error}`);
            else {
              const d = r.data;
              const parts = [`${d.newVideos} new videos`, d.newReadings ? `${d.newReadings} new articles` : null, `${d.filtered} filtered out`, `${d.scored} judged`];
              setMsg(parts.filter(Boolean).join(", ") + (d.errors.length ? `. ${d.errors.length} problem(s): ${d.errors.slice(0, 2).join("; ")}` : ""));
            }
          })
        }
      >
        {pending ? "Working… (this can take a minute)" : label}
      </button>
      {msg ? <span className="small muted">{msg}</span> : null}
    </span>
  );
}
