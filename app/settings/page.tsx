import { headers } from "next/headers";
import { getSettings, hasAi, hasYouTubeKey } from "@/lib/settings";
import { saveSettingsAction } from "@/app/actions";
import { JUDGE_MODEL, MODEL } from "@/lib/ai";
import { JEV_MODEL, chooseJudge } from "@/lib/jev";
import GoalsEditor from "@/components/GoalsEditor";
import SourcesList, { BlockedList } from "@/components/SourcesList";
import { AddChannelForm, AddFeedForm } from "@/components/SourceForms";
import RefreshButton from "@/components/RefreshButton";
import SubmitButton from "@/components/SubmitButton";
import CopyButton from "@/components/CopyButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = getSettings();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const shareUrl = `${origin}/share/${s.shareToken}`;
  const scorer = chooseJudge();

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>Settings</h1>
      <nav className="chips-bar" aria-label="Settings sections">
        <a href="#rules" className="chip">Filter rules</a>
        <a href="#goals" className="chip">Goals</a>
        <a href="#sources" className="chip">Sources</a>
        <a href="#feed" className="chip">Feed</a>
        <a href="#buddy" className="chip">Accountability buddy</a>
        <a href="#setup" className="chip">API keys</a>
      </nav>

      <h2 id="rules">Filter rules</h2>
      <form action={saveSettingsAction} className="card">
        <div className="field">
          <label htmlFor="rules">Your rules for the AI judge</label>
          <textarea id="rules" name="rules" defaultValue={s.rules} rows={6} />
          <div className="hint">Plain English. The judge follows these when scoring every video, article and podcast.</div>
        </div>
        <div className="field">
          <label htmlFor="blockedKeywords">Blocked keywords</label>
          <input id="blockedKeywords" name="blockedKeywords" defaultValue={s.blockedKeywords.join(", ")} />
          <div className="hint">Comma-separated. Anything with these in the title or description is dropped before judging.</div>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label htmlFor="minDurationMin">Min length (min)</label>
            <input id="minDurationMin" name="minDurationMin" type="number" min={0} max={120} defaultValue={s.minDurationMin} />
            <div className="hint">Drops Shorts and clips.</div>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label htmlFor="maxDurationMin">Max length (min)</label>
            <input id="maxDurationMin" name="maxDurationMin" type="number" min={0} max={600} defaultValue={s.maxDurationMin} />
            <div className="hint">0 = no limit.</div>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label htmlFor="threshold">Minimum score (0-10)</label>
            <input id="threshold" name="threshold" type="number" min={0} max={10} step={0.5} defaultValue={s.threshold} />
            <div className="hint">Only videos at or above this are picked.</div>
          </div>
        </div>
        <h3 style={{ marginTop: 8 }}>Healthy limits</h3>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label htmlFor="dailyBudgetMin">Daily time budget (min)</label>
            <input id="dailyBudgetMin" name="dailyBudgetMin" type="number" min={0} max={600} defaultValue={s.dailyBudgetMin} />
            <div className="hint">The player locks when it&apos;s used up. 0 = no limit.</div>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label htmlFor="dailyPicks">Picks in your lineup</label>
            <input id="dailyPicks" name="dailyPicks" type="number" min={1} max={50} defaultValue={s.dailyPicks} />
            <div className="hint">Each pick stays until you finish or drop it. No endless scroll.</div>
          </div>
        </div>
        <label className="row" style={{ fontWeight: 400 }}>
          <input type="checkbox" name="rejudge" defaultChecked style={{ width: "auto" }} /> Re-judge unwatched videos if the rules changed
        </label>
        <div style={{ marginTop: 12 }}>
          <SubmitButton className="primary" pendingText="Saving…">Save settings</SubmitButton>
        </div>
      </form>

      <h2 id="goals">Goals</h2>
      <GoalsEditor />

      <h2 id="sources">Sources</h2>
      <div className="card stack">
        <AddChannelForm />
        <SourcesList kind="channel" />
      </div>
      <div className="card stack">
        <AddFeedForm />
        <SourcesList kind="feed" />
        <p className="small muted">
          Tip: most blogs have a feed at <code>/feed</code> or <code>/rss</code>. Substack newsletters use <code>https://NAME.substack.com/feed</code>. Podcasts list their RSS feed on their website or on podcast directories.
        </p>
      </div>

      <h3>Blocked channels</h3>
      <BlockedList />

      <h2 id="feed">Feed</h2>
      <div className="card stack">
        <p className="small muted" style={{ margin: 0 }}>
          The feed refreshes on its own every 6 hours while you use the app. {s.lastRefreshAt ? `Last refresh: ${new Date(s.lastRefreshAt).toLocaleString()}.` : ""}
        </p>
        <div className="row">
          <RefreshButton />
          <RefreshButton label="Re-judge everything" rejudge />
        </div>
      </div>

      <h2 id="buddy">Accountability buddy</h2>
      <div className="card">
        <p className="small">
          Share this private link with a friend. They&apos;ll see your goals, streak, time per goal and completed action steps, but not your notes or watch intents.
        </p>
        <div className="inline-form">
          <input readOnly value={shareUrl} aria-label="Share link" />
          <CopyButton text={shareUrl} />
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>Your friend needs to be able to reach this server (e.g. if you host RightFeed online).</p>
      </div>

      <h2 id="setup">API keys</h2>
      <div className="card small">
        <p>
          <b>YOUTUBE_API_KEY</b> {hasYouTubeKey() ? "(set)" : "(not set)"}: searches YouTube for your goals and reads video lengths so Shorts are dropped reliably. Free (10,000 units a day; RightFeed uses about 200 per goal per day).
          Get one at <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">Google Cloud Console</a>: enable “YouTube Data API v3”, then create an API key under Credentials.
        </p>
        <p>
          <b>ANTHROPIC_API_KEY</b> {hasAi() ? "(set)" : "(not set)"}: powers the AI judge, summaries, quizzes, flashcards, learning paths and weekly reflections.
          Get one at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a>. Scoring uses <code>{JUDGE_MODEL}</code> (set <code>JUDGE_MODEL</code> to change it). Everything else uses <code>{MODEL}</code> (set <code>CLAUDE_MODEL</code> to change it).
        </p>
        <p>
          <b>TYPESAFE_API_KEY</b> {process.env.TYPESAFE_API_KEY ? "(set)" : "(not set)"}: scores videos with Jev (<code>{JEV_MODEL}</code>) instead. Add <code>JUDGE_PROVIDER=jev</code> to use it when both AI keys are set.
          Get one at <a href="https://typesafe.ai" target="_blank" rel="noreferrer">typesafe.ai</a>. Summaries, quizzes and paths still use the key above.
        </p>
        <p>Videos are scored by: <b>{scorer === "jev" ? `Jev (${JEV_MODEL})` : scorer === "claude" ? JUDGE_MODEL : "keyword matching"}</b></p>
        <p className="muted" style={{ margin: 0 }}>Put keys in a <code>.env.local</code> file in the project folder and restart the app.</p>
      </div>
    </div>
  );
}
