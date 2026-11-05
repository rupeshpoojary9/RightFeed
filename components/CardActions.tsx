"use client";
import { useState, useTransition } from "react";
import { blockChannel, dropPick, moveToTopOfWatchLater, setFeedback, toggleWatchLater } from "@/app/actions";
import Link from "next/link";
import Icon from "./Icons";

export default function CardActions({
  videoId,
  channelId,
  channelTitle,
  watchLater,
  pick = false,
  inPlaylist = false,
}: {
  videoId: string;
  channelId: string;
  channelTitle: string;
  watchLater: boolean;
  /** An unfinished video in the lineup, so it can be dropped and replaced. */
  pick?: boolean;
  /** Shown inside the Watch later playlist. */
  inPlaylist?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div
      className="vmenu"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button className="iconbtn" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open ? (
        <div role="menu" className="menu">
          {pick ? (
            <button role="menuitem" disabled={pending} title="Teaches the judge" onClick={() => start(async () => { await dropPick(videoId); setOpen(false); })}>
              <Icon name="close" />
              Drop and replace
            </button>
          ) : null}
          {inPlaylist ? (
            <button role="menuitem" disabled={pending} onClick={() => start(async () => { await moveToTopOfWatchLater(videoId); setOpen(false); })}>
              <Icon name="up-arrow" />
              Move to top
            </button>
          ) : null}
          <button role="menuitem" disabled={pending} onClick={() => start(async () => { await toggleWatchLater(videoId); setOpen(false); })}>
            <Icon name="save" />
            {watchLater ? "Remove from Watch later" : "Save to Watch later"}
          </button>
          <Link role="menuitem" href={`/paths/add?video=${videoId}`}>
            <Icon name="path" />
            Add to path
          </Link>
          {pick ? null : (
            <button role="menuitem" disabled={pending} title="Teaches the judge" onClick={() => start(async () => { await setFeedback(videoId, -1); setOpen(false); })}>
              <Icon name="down" />
              Not for me
            </button>
          )}
          <button
            role="menuitem"
            className="danger"
            disabled={pending}
            onClick={() => {
              if (confirm(`Never show videos from ${channelTitle} again?`)) start(() => blockChannel(channelId, channelTitle));
            }}
          >
            <Icon name="block" />
            Block channel
          </button>
        </div>
      ) : null}
    </div>
  );
}
