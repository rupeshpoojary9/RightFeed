import { all } from "@/lib/db";
import { removeSource, unblockSource } from "@/app/actions";
import type { Source } from "@/lib/types";

export default function SourcesList({ kind }: { kind: "channel" | "feed" }) {
  const sources = all<Source>("SELECT * FROM sources WHERE kind = ? AND blocked = 0 ORDER BY title", kind);
  if (!sources.length) return <p className="small muted">None yet.</p>;
  return (
    <div className="list">
      {sources.map((s) => (
        <div key={s.id} className="list-row" style={{ alignItems: "center" }}>
          <div className="grow">
            {kind === "channel" ? (
              <a href={`https://www.youtube.com/channel/${s.ref}`} target="_blank" rel="noreferrer">{s.title || s.ref}</a>
            ) : (
              <a href={s.ref} target="_blank" rel="noreferrer">{s.title || s.ref}</a>
            )}
            {s.last_error ? <div className="small" style={{ color: "var(--color-error)" }}>Last fetch failed: {s.last_error}</div> : null}
          </div>
          <form action={removeSource}>
            <input type="hidden" name="id" value={s.id} />
            <button className="ghost small danger" aria-label={`Remove ${s.title}`}>Remove</button>
          </form>
        </div>
      ))}
    </div>
  );
}

export function BlockedList() {
  const blocked = all<Source>("SELECT * FROM sources WHERE blocked = 1 ORDER BY title");
  if (!blocked.length) return <p className="small muted">No blocked channels. Open the menu on any video to block its channel.</p>;
  return (
    <div className="list">
      {blocked.map((s) => (
        <div key={s.id} className="list-row" style={{ alignItems: "center" }}>
          <div className="grow">{s.title || s.ref}</div>
          <form action={unblockSource}>
            <input type="hidden" name="id" value={s.id} />
            <button className="ghost small">Unblock</button>
          </form>
        </div>
      ))}
    </div>
  );
}
