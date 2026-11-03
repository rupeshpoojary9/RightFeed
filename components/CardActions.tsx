"use client";
import { useState, useTransition } from "react";
import { blockChannel, setFeedback, toggleWatchLater } from "@/app/actions";

export default function CardActions({
  videoId,
  channelId,
  channelTitle,
  watchLater,
}: {
  videoId: string;
  channelId: string;
  channelTitle: string;
  watchLater: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="row" style={{ position: "relative" }}>
      <button
        className="ghost small"
        title={watchLater ? "Remove from Watch later" : "Save to Watch later"}
        aria-pressed={watchLater}
        disabled={pending}
        onClick={() => start(() => toggleWatchLater(videoId))}
      >
        {watchLater ? "★" : "☆"}
      </button>
      <button className="ghost small" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="More">
        ⋯
      </button>
      {open ? (
        <div
          role="menu"
          className="card"
          style={{ position: "absolute", right: 0, bottom: "110%", zIndex: 5, padding: 6, minWidth: 210 }}
          onMouseLeave={() => setOpen(false)}
        >
          <button
            role="menuitem"
            className="ghost"
            style={{ width: "100%" }}
            disabled={pending}
            onClick={() => start(async () => {
              await setFeedback(videoId, -1);
              setOpen(false);
            })}
          >
            👎 Not for me (teach the judge)
          </button>
          <button
            role="menuitem"
            className="ghost danger"
            style={{ width: "100%" }}
            disabled={pending}
            onClick={() => {
              if (confirm(`Never show videos from ${channelTitle} again?`)) start(() => blockChannel(channelId, channelTitle));
            }}
          >
            🚫 Block {channelTitle.length > 18 ? "channel" : channelTitle}
          </button>
        </div>
      ) : null}
    </div>
  );
}
