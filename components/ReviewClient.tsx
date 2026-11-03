"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteCard, gradeCard } from "@/app/actions";
import type { Flashcard } from "@/lib/types";

type Card = Flashcard & { title: string | null };

export default function ReviewClient({ cards, nextDue }: { cards: Card[]; nextDue: string | null }) {
  const [queue, setQueue] = useState(cards);
  const [shown, setShown] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [pending, start] = useTransition();

  const card = queue[0];
  if (!card) {
    return (
      <div className="card empty">
        <h2>{reviewed ? `All done: ${reviewed} reviewed 🎉` : "Nothing due right now"}</h2>
        <p>{nextDue ? `Next cards are due on ${nextDue}.` : "Make flashcards from the “Act on it” tab after watching a video."}</p>
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
    <div className="card">
      <div className="spread small muted">
        <span>{queue.length} left</span>
        {card.video_id ? <Link href={`/watch/${card.video_id}`}>from {card.title ?? "a video"}</Link> : <span>Your own card</span>}
      </div>
      <div className="flash">
        <div style={{ fontWeight: 600 }}>{card.front}</div>
        {shown ? <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, width: "100%" }}>{card.back}</div> : null}
      </div>
      {!shown ? (
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="primary" onClick={() => setShown(true)}>Show answer</button>
        </div>
      ) : (
        <div className="row" style={{ justifyContent: "center" }}>
          <button disabled={pending} onClick={() => grade(0)}>Forgot</button>
          <button disabled={pending} onClick={() => grade(1)}>Hard</button>
          <button disabled={pending} className="primary" onClick={() => grade(2)}>Good</button>
          <button disabled={pending} onClick={() => grade(3)}>Easy</button>
        </div>
      )}
      <div style={{ textAlign: "right", marginTop: 8 }}>
        <button className="ghost small danger" disabled={pending} onClick={() => start(async () => {
          await deleteCard(card.id);
          setShown(false);
          setQueue((q) => q.slice(1));
        })}>Delete card</button>
      </div>
    </div>
  );
}
