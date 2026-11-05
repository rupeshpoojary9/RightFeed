import { all, get } from "@/lib/db";
import { addCard } from "@/app/actions";
import { today } from "@/lib/dates";
import type { Flashcard } from "@/lib/types";
import ReviewClient from "@/components/ReviewClient";

export const dynamic = "force-dynamic";

export default function ReviewPage() {
  const due = all<Flashcard & { title: string | null }>(
    "SELECT f.*, v.title FROM flashcards f LEFT JOIN videos v ON v.id = f.video_id WHERE f.due_day <= ? ORDER BY f.due_day, f.id LIMIT 50",
    today(),
  );
  const total = get<{ n: number }>("SELECT COUNT(*) AS n FROM flashcards")?.n ?? 0;
  const dueCount = get<{ n: number }>("SELECT COUNT(*) AS n FROM flashcards WHERE due_day <= ?", today())?.n ?? 0;
  const nextDue = get<{ d: string | null }>("SELECT MIN(due_day) AS d FROM flashcards WHERE due_day > ?", today())?.d;

  return (
    <div className="learn-page">
      <h1>Review</h1>
      <p className="muted">Each card comes back just before you&apos;d forget it. A few minutes a day keeps what you learned.</p>
      <div className="review-layout">
        <ReviewClient key={total} cards={due} nextDue={nextDue ?? null} total={total} />

        <aside className="review-side">
          <dl className="facts facts-stack">
            <div className="fact"><dt>Due today</dt><dd>{dueCount}</dd></div>
            <div className="fact"><dt>In your deck</dt><dd>{total}</dd></div>
          </dl>
          <h2>Add a card</h2>
          <form action={addCard}>
            <div className="field">
              <label htmlFor="front">Question</label>
              <input id="front" name="front" required />
            </div>
            <div className="field">
              <label htmlFor="back">Answer</label>
              <textarea id="back" name="back" required style={{ minHeight: 60 }} />
            </div>
            <button>Add card</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
