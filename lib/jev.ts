import "server-only";
import { choice, noul, score, TypeSafeClient, type Questions } from "@typesafe-ai/sdk";
import { clip, type JudgeContext, type JudgeInput, type Verdict } from "./ai.ts";

export const JEV_MODEL = process.env.JEV_MODEL || "jev-latest";

export type Scorer = "claude" | "jev";

/** Picks the AI that scores videos. JUDGE_PROVIDER wins if its key is set, otherwise whichever key exists. */
export function chooseJudge(env: Record<string, string | undefined> = process.env): Scorer | null {
  const claude = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  const jev = Boolean(env.TYPESAFE_API_KEY);
  const wanted = env.JUDGE_PROVIDER?.trim().toLowerCase();
  if (wanted === "jev" && jev) return "jev";
  if (wanted === "claude" && claude) return "claude";
  return claude ? "claude" : jev ? "jev" : null;
}

/** Each level, the 0-10 score it stands for, and how a card describes it. */
const LEVELS = [
  { text: "Entertainment, clickbait, drama, outrage, hype or fluff that would not help this person grow", score: 1.5, label: "Looks like fluff" },
  { text: "Loosely related to their goals, or thin on substance", score: 5, label: "Only loosely useful" },
  { text: "Solid and useful for their goals", score: 7.5, label: "Solid and useful" },
  { text: "Substantive and credible, and directly serves one of their goals", score: 9.5, label: "Substantive and directly useful" },
];

/** Maps a position on the levels (it can land between two) to the 0-10 scale the feed threshold uses. */
export function levelToScore(position: number): number {
  const p = Math.max(0, Math.min(LEVELS.length - 1, position));
  const low = Math.floor(p);
  const high = Math.min(low + 1, LEVELS.length - 1);
  return Math.round(LEVELS[low].score + (LEVELS[high].score - LEVELS[low].score) * (p - low));
}

/** Jev returns judgments, not sentences, so the reason on the card is written here. */
export function jevReason(position: number, goal: string | null): string {
  const { label } = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Math.round(position)))];
  return goal ? `${label} for ${goal}.` : `${label}.`;
}

export function jevState(it: JudgeInput, ctx: JudgeContext) {
  return {
    video: {
      title: it.title.toWellFormed(),
      channel: it.channel.toWellFormed(),
      kind: it.kind,
      subscribed: Boolean(it.subscribed),
      length_minutes: it.durationMin,
      description: clip(it.description, 800),
    },
    viewer: {
      goals: ctx.goals,
      rules: ctx.rules,
      videos_they_valued: ctx.liked,
      videos_they_disliked: ctx.disliked,
    },
  };
}

export function jevQuestions(ctx: JudgeContext): Questions {
  const goals = Object.fromEntries(ctx.goals.map((g) => [g.name, g.description || null]));
  const value = score(
    "How much would `video` genuinely help this person grow toward `viewer.goals`? Follow `viewer.rules` strictly. Be skeptical of sensational titles, and reward depth, expertise and actionability. When `video.subscribed` is true the viewer chose this channel, so do not mark it down for an attention-grabbing title. Use `viewer.videos_they_valued` and `viewer.videos_they_disliked` to match their taste.",
    LEVELS.map((l) => l.text),
  );
  if (!ctx.goals.length) return { value };
  return {
    value,
    fits: noul("Does `video` directly serve at least one of `viewer.goals`?"),
    goal: choice("Which one of `viewer.goals` does `video` serve best?", goals),
  };
}

let client: TypeSafeClient | null = null;

/** Scores each item in its own request, so one video's text can't colour another's score. */
export async function judgeWithJev(items: JudgeInput[], ctx: JudgeContext): Promise<Verdict[]> {
  client ??= new TypeSafeClient();
  const jev = client;
  const questions = jevQuestions(ctx);
  return Promise.all(
    items.map(async (it) => {
      const { answers } = await jev.systemOne({ model: JEV_MODEL, state: jevState(it, ctx), questions });
      const a = answers as unknown as { value: { score: number }; fits?: { noul: number }; goal?: { choice: string } };
      const goal = a.goal && a.fits && a.fits.noul >= 0.5 ? a.goal.choice : null;
      return { id: it.id, score: levelToScore(a.value.score), goal, reason: jevReason(a.value.score, goal) };
    }),
  );
}
