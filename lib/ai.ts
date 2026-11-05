import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { QuizQuestion, Summary } from "./types";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
/** Model for the judge (scoring/classifying videos). Cheap and fast by default. */
export const JUDGE_MODEL = process.env.JUDGE_MODEL || "claude-haiku-5-5";

/**
 * Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
 * Others reject the parameter, so it is only sent here.
 */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
export const supportsFallbacks = (model: string) => FALLBACK_MODELS.has(model);

let client: Anthropic | null = null;
function anthropic() {
  client ??= new Anthropic();
  return client;
}

export class AiUnavailableError extends Error {}

type Effort = "low" | "medium" | "high";

/**
 * One structured-output request. On models that support it, uses server-side
 * refusal fallbacks ("default" picks the right fallback model automatically).
 */
async function structured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  prompt: string;
  model?: string;
  effort?: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new AiUnavailableError("Set ANTHROPIC_API_KEY to enable AI features");
  }
  const model = opts.model ?? MODEL;
  const fallback = supportsFallbacks(model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
  const response = await anthropic().beta.messages.parse({
    model,
    max_tokens: opts.maxTokens ?? 16000,
    ...fallback,
    output_config: { effort: opts.effort ?? "low", format: betaZodOutputFormat(opts.schema) },
    system: opts.system.toWellFormed(),
    messages: [{ role: "user", content: opts.prompt.toWellFormed() }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined this request");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The AI response was cut off (max_tokens)");
  }
  if (response.parsed_output == null) {
    throw new Error("The AI returned an unexpected response");
  }
  return response.parsed_output as z.infer<S>;
}

/** Cuts to n characters. toWellFormed repairs an emoji split by the cut, which the API would reject. */
export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).toWellFormed() + "…" : s);

/* --------------------------------- Judge --------------------------------- */

export type JudgeInput = {
  id: string;
  title: string;
  channel: string;
  description: string;
  durationMin: number | null;
  kind: "video" | "article" | "podcast";
  /** The user follows this channel. */
  subscribed?: boolean;
};

export type Verdict = { id: string; score: number; goal: string | null; reason: string };

/** The goal field only allows the user's exact goal names, so verdicts always map back to a goal. */
export function verdictSchema(goalNames: string[]) {
  const names = [...new Set(goalNames)];
  const goal = names.length ? z.enum(names as [string, ...string[]]).nullable() : z.null();
  return z.object({
    verdicts: z.array(
      z.object({
        id: z.string(),
        score: z.number().describe("0-10. 10 = exceptional, directly helps a goal; 0 = brain rot"),
        goal: goal.describe("The best-matching goal, or null"),
        reason: z.string().describe("One short sentence explaining the score, addressed to the user"),
      }),
    ),
  });
}

export type JudgeContext = { goals: { name: string; description: string }[]; rules: string; liked: string[]; disliked: string[] };

export async function judge(items: JudgeInput[], ctx: JudgeContext): Promise<Verdict[]> {
  const goals = ctx.goals.map((g) => `- ${g.name}${g.description ? `: ${g.description}` : ""}`).join("\n") || "- (none set: judge general self-improvement value)";
  const taste = [
    ctx.liked.length ? `Videos the user rated as genuinely valuable:\n${ctx.liked.map((t) => `+ ${t}`).join("\n")}` : "",
    ctx.disliked.length ? `Videos the user said were NOT worth their time:\n${ctx.disliked.map((t) => `- ${t}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = `You are the content judge for RightFeed, a personal feed whose whole purpose is to help one person become a better version of themselves, and to keep out "brain rot": content optimised for attention rather than value.

Score each item 0-10 for how much it would genuinely help this person grow toward their goals, judging from the title, channel and description.
- 9-10: substantive, credible, directly serves a goal.
- 7-8: solid and useful.
- 4-6: loosely related or thin.
- 0-3: entertainment, clickbait, drama, outrage, hype, or fluff.
Be skeptical of sensational titles. Reward depth, expertise and actionability.
Items marked "subscribed" come from channels the user chose to follow, so they already trust the source: don't mark these down for an attention-grabbing title or thumbnail style alone, and judge what the video actually offers. Pure entertainment or off-topic videos from these channels still score low.

The user's goals:
${goals}

The user's own rules (follow them strictly):
${ctx.rules}${taste ? `\n\n${taste}\n\nUse these ratings to calibrate to the user's taste.` : ""}

Return one verdict per item, using the item's exact id.`;

  const prompt = items
    .map(
      (it) =>
        `<item id="${it.id}" kind="${it.kind}">\nTitle: ${it.title}\nChannel/source: ${it.channel}${it.subscribed ? " (subscribed)" : ""}${it.durationMin != null ? `\nLength: ${it.durationMin} min` : ""}\nDescription: ${clip(it.description.replace(/\s+/g, " "), 700)}\n</item>`,
    )
    .join("\n\n");

  const out = await structured({ schema: verdictSchema(ctx.goals.map((g) => g.name)), system, prompt, model: JUDGE_MODEL, effort: "low" });
  return out.verdicts.map((v) => ({ ...v, score: Math.max(0, Math.min(10, v.score)) }));
}

/* ------------------------------- Summaries ------------------------------- */

const SummarySchema = z.object({
  tldr: z.string().describe("2-3 sentence summary"),
  key_points: z.array(z.string()).describe("4-8 key takeaways"),
  action_ideas: z.array(z.string()).describe("2-4 concrete things the user could do after watching"),
});

export async function summarize(v: { title: string; channel: string; description: string; transcript: string | null; goals: string[] }): Promise<Summary> {
  const basedOn = v.transcript ? "transcript" : "description";
  const source = v.transcript ? `Transcript (with [seconds] timestamps):\n${clip(v.transcript, 120000)}` : `Description:\n${v.description}`;
  const out = await structured({
    schema: SummarySchema,
    effort: "medium",
    system:
      "You summarise YouTube videos so a busy person can decide whether to watch and remember what they learned. Be concrete and specific; no filler. If only a description is available, say what the video likely covers and keep claims modest.",
    prompt: `Video: "${v.title}" by ${v.channel}\nThe viewer's goals: ${v.goals.join("; ") || "general self-improvement"}\n\n${source}`,
  });
  return { ...out, based_on: basedOn };
}

/* --------------------------------- Quiz ---------------------------------- */

const QuizSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).describe("Exactly 4 options"),
      answer_index: z.number().int().describe("0-based index of the correct option"),
      explanation: z.string().describe("Why that answer is right, in one or two sentences"),
    }),
  ),
});

/** Models favour certain answer positions, so options are shuffled here to keep the answer unguessable. */
export function shuffleOptions(q: QuizQuestion, random: () => number = Math.random): QuizQuestion {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, options: order.map((i) => q.options[i]), answer_index: order.indexOf(q.answer_index) };
}

export async function makeQuiz(v: { title: string; material: string }): Promise<QuizQuestion[]> {
  const out = await structured({
    schema: QuizSchema,
    effort: "medium",
    system:
      "You write short active-recall quizzes. Write exactly 3 multiple-choice questions that test understanding of the most important ideas (not trivia like names or dates). Each has 4 plausible options and one correct answer.",
    prompt: `Video: "${v.title}"\n\nMaterial:\n${clip(v.material, 100000)}`,
  });
  return out.questions
    .filter((q) => q.options.length >= 2 && q.answer_index >= 0 && q.answer_index < q.options.length)
    .slice(0, 3)
    .map((q) => shuffleOptions(q));
}

/* ------------------------------ Flashcards ------------------------------- */

const CardsSchema = z.object({
  cards: z.array(z.object({ front: z.string().describe("A question or prompt"), back: z.string().describe("A concise answer") })),
});

export async function makeFlashcards(v: { title: string; material: string }) {
  const out = await structured({
    schema: CardsSchema,
    effort: "medium",
    system:
      "You create spaced-repetition flashcards. Write 4-8 cards capturing the ideas most worth remembering long term. One idea per card; the back should be short enough to recall from memory.",
    prompt: `Source: "${v.title}"\n\nMaterial:\n${clip(v.material, 100000)}`,
  });
  return out.cards.filter((c) => c.front.trim() && c.back.trim());
}

/* ------------------------------ Learning path ---------------------------- */

const PathSchema = z.object({
  title: z.string(),
  description: z.string().describe("One or two sentences on what the learner will get from this path"),
  steps: z.array(z.object({ id: z.string(), why: z.string().describe("Why this video is at this point in the path") })),
});

export async function buildPath(goal: { name: string; description: string }, candidates: JudgeInput[]) {
  return structured({
    schema: PathSchema,
    effort: "medium",
    system:
      "You design learning paths from a pool of videos. Choose 5-10 videos that together form a coherent course from fundamentals to advanced, ordered so each builds on the previous. Only use ids from the pool. Skip redundant or weak videos.",
    prompt: `Goal: ${goal.name}${goal.description ? ` (${goal.description})` : ""}\n\nPool:\n${candidates
      .map((c) => `<video id="${c.id}">${c.title}, by ${c.channel}${c.durationMin ? `, ${c.durationMin} min` : ""}. ${clip(c.description.replace(/\s+/g, " "), 300)}</video>`)
      .join("\n")}`,
  });
}

/* --------------------------- Weekly reflection --------------------------- */

const ReflectionSchema = z.object({
  headline: z.string().describe("One encouraging but honest sentence about the week"),
  learned: z.array(z.string()).describe("Main ideas the user learned"),
  applied: z.array(z.string()).describe("What the user actually put into practice"),
  patterns: z.string().describe("Observations about their habits: balance across goals, consistency, quiz performance"),
  next_week: z.array(z.string()).describe("2-3 specific suggestions for next week"),
});

export type Reflection = z.infer<typeof ReflectionSchema>;

export async function weeklyReflection(data: string): Promise<Reflection> {
  return structured({
    schema: ReflectionSchema,
    effort: "medium",
    system:
      "You are a thoughtful coach writing a short weekly reflection for someone using a growth-focused video app. Base everything on the data given. Be warm but honest; celebrate real progress and point out gaps (e.g. lots of watching but few actions done).",
    prompt: data,
  });
}
