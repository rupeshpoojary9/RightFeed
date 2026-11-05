import { get } from "@/lib/db";
import { finishOnboarding } from "@/app/actions";
import { hasAi, hasYouTubeKey } from "@/lib/settings";
import GoalsEditor from "@/components/GoalsEditor";
import SourcesList from "@/components/SourcesList";
import { AddChannelForm } from "@/components/SourceForms";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default function WelcomePage() {
  const goals = get<{ n: number }>("SELECT COUNT(*) AS n FROM goals")?.n ?? 0;
  const channels = get<{ n: number }>("SELECT COUNT(*) AS n FROM sources WHERE kind = 'channel' AND blocked = 0")?.n ?? 0;
  const canFinish = goals > 0 && (channels > 0 || hasYouTubeKey());

  return (
    <div className="stack" style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1>Welcome to RightFeed</h1>
      <p className="muted">
        A video feed that only shows what helps you grow. Tell it what you&apos;re working on and which creators you trust. It
        fetches new videos, filters out Shorts and clickbait, and has an AI judge pick a small set for you each day.
      </p>

      <h2>1. Your goals</h2>
      <p className="small muted">Pick 3 to 5. Everything in your feed has to serve one of these.</p>
      <GoalsEditor />

      <h2>2. Channels you trust</h2>
      <p className="small muted">
        Their new uploads go straight into the judge. {hasYouTubeKey() ? "Your YouTube API key will also search for videos matching your goals." : "Add at least one, because without a YouTube API key these are your only source."}
      </p>
      <div className="card stack">
        <AddChannelForm />
        <SourcesList kind="channel" />
      </div>

      <h2>3. Ready</h2>
      <div className="card">
        <ul className="clean small">
          <li>{hasYouTubeKey() ? "YouTube API key found: goal search and Shorts detection on." : "No YouTube API key: channels only. You can add it later."}</li>
          <li>{hasAi() ? "AI key found: AI judge, summaries, quizzes and paths on." : "No AI API key: basic keyword scoring. You can add it later."}</li>
        </ul>
        <p className="small muted">You can fine-tune your rules, daily time budget and number of picks in Settings at any time.</p>
        <form action={finishOnboarding}>
          <SubmitButton className="primary" disabled={!canFinish} pendingText="Fetching and judging your first videos…">
            Build my feed
          </SubmitButton>
        </form>
        {!canFinish ? <p className="small muted" style={{ marginTop: 8 }}>Add at least one goal and one channel to continue.</p> : null}
      </div>
    </div>
  );
}
