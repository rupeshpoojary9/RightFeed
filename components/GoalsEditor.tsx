import { all } from "@/lib/db";
import { addGoal, deleteGoal, updateGoal } from "@/app/actions";
import type { Goal } from "@/lib/types";

const STARTERS = [
  { name: "Health & fitness", description: "Exercise, sleep, nutrition backed by evidence", search_query: "evidence based fitness sleep nutrition explained" },
  { name: "Career & skills", description: "Get better at my job and learn in-demand skills", search_query: "career skills advice from experts" },
  { name: "Personal finance", description: "Budgeting, investing, building wealth calmly", search_query: "personal finance investing basics explained" },
  { name: "Focus & productivity", description: "Deep work, habits, discipline", search_query: "deep work habits productivity science" },
  { name: "Mindset & mental health", description: "Resilience, stress, emotional health", search_query: "psychology mental health resilience lecture" },
  { name: "Communication", description: "Public speaking, writing, relationships", search_query: "how to communicate public speaking skills" },
];

export default function GoalsEditor() {
  const goals = all<Goal>("SELECT * FROM goals ORDER BY id");
  const existing = new Set(goals.map((g) => g.name.toLowerCase()));
  const starters = STARTERS.filter((s) => !existing.has(s.name.toLowerCase()));

  return (
    <div className="stack">
      {goals.map((g) => (
        <details key={g.id} className="card goal">
          <summary>
            <strong>{g.name}</strong>
            {g.description ? <span className="small muted">{g.description}</span> : null}
          </summary>
          <form action={updateGoal}>
            <input type="hidden" name="id" value={g.id} />
            <div className="field">
              <label htmlFor={`gn${g.id}`}>Goal</label>
              <input id={`gn${g.id}`} name="name" defaultValue={g.name} required />
            </div>
            <div className="field">
              <label htmlFor={`gd${g.id}`}>What does success look like?</label>
              <input id={`gd${g.id}`} name="description" defaultValue={g.description} placeholder="Helps the AI judge understand what you need" />
            </div>
            <div className="field">
              <label htmlFor={`gq${g.id}`}>YouTube search terms</label>
              <input id={`gq${g.id}`} name="search_query" defaultValue={g.search_query} />
              <div className="hint">Used daily to discover new videos (needs a YouTube API key).</div>
            </div>
            <div className="row">
              <button>Save</button>
              <button formAction={deleteGoal} className="ghost danger">Delete</button>
            </div>
          </form>
        </details>
      ))}

      <details className="card goal">
        <summary><strong>Add a goal</strong></summary>
        <form action={addGoal}>
        <div className="field">
          <label htmlFor="new-goal">Goal</label>
          <input id="new-goal" name="name" placeholder="e.g. Learn system design" required />
        </div>
        <div className="field">
          <label htmlFor="new-goal-d">What does success look like? (optional)</label>
          <input id="new-goal-d" name="description" placeholder="e.g. Pass senior engineer interviews in 3 months" />
        </div>
        <div className="field">
          <label htmlFor="new-goal-q">YouTube search terms (optional)</label>
          <input id="new-goal-q" name="search_query" placeholder="Defaults to the goal name" />
        </div>
        <button className="primary">Add goal</button>
        </form>
      </details>

      {starters.length ? (
        <div>
          <div className="small muted" style={{ marginBottom: 6 }}>Or start from a common goal:</div>
          <div className="row">
            {starters.map((s) => (
              <form key={s.name} action={addGoal}>
                <input type="hidden" name="name" value={s.name} />
                <input type="hidden" name="description" value={s.description} />
                <input type="hidden" name="search_query" value={s.search_query} />
                <button className="small">+ {s.name}</button>
              </form>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
