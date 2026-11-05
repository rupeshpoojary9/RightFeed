"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteCard, gradeCard } from "@/app/actions";
import type { Flashcard } from "@/lib/types";

type Card = Flashcard & { title: string | null };

const shortDate = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function ReviewClient({ cards, nextDue, total }: { cards: Card[]; nextDue: string | null; total: number }) {
  const [queue, setQueue] = useState(cards);
  const [shown, setShown] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [pending, start] = useTransition();

  const card = queue[0];
  if (!card) {
    return (
      <div className="stage stage-empty">
        {total ? (
          <>
            <h2>{reviewed ? `${reviewed} reviewed. All done.` : "You're all caught up"}</h2>
            <p className="muted">{nextDue ? `Your next cards come back on ${shortDate(nextDue)}.` : "No cards are scheduled."}</p>
          </>
        ) : (
          <>
            <h2>Your deck is empty</h2>
            <p className="muted">Open a video you've watched, go to Act on it and make flashcards. They come back here just before you'd forget them.</p>
            <Link href="/library?tab=history" className="btn primary">Go to your history</Link>
          </>
        )}
      </div>
    );
  }

  const grade = (g: 0 | 1 | 2 | 3) =>
    start(async () => {
      await gradeCard(card.id, g);
      setReviewed((n) => n + 1);
      setShown(false);
      // "Forgot" cards come back at the end of this session too.
      setQueue((q) => (g === 0 ? [...q.slice(1), q[0]] : q.slice(1)));
    });

  return (
    <div className="stage">
      <div className="stage-top small muted">
        <span>{queue.length} left</span>
        {card.video_id ? <Link href={`/watch/${card.video_id}`}>{card.title ?? "From a video"}</Link> : <span>Your own card</span>}
      </div>
      <div className="track" aria-hidden="true"><span style={{ width: `${(100 * reviewed) / (reviewed + queue.length)}%` }} /></div>
      <div className="flash">
        <p className="flash-front">{card.front}</p>
        {shown ? <p className="flash-back">{card.back}</p> : null}
      </div>
      {!shown ? (
        <button className="primary stage-cta" onClick={() => setShown(true)}>Show answer</button>
      ) : (
        <div className="grades">
          <button disabled={pending} onClick={() => grade(0)}>Forgot</button>
          <button disabled={pending} onClick={() => grade(1)}>Hard</button>
          <button disabled={pending} className="primary" onClick={() => grade(2)}>Good</button>
          <button disabled={pending} onClick={() => grade(3)}>Easy</button>
        </div>
      )}
      <button className="ghost small danger stage-delete" disabled={pending} onClick={() => start(async () => {
        await deleteCard(card.id);
        setShown(false);
        setQueue((q) => q.slice(1));
      })}>Delete card</button>
    </div>
  );
}
