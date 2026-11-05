import { groupSteps } from "./paths";
import "server-only";
import { all, get, run, tx } from "./db";
import { addDays, today, weekStart } from "./dates";
import { fetchTranscript } from "./youtube";
import { makeFlashcards, makeQuiz, summarize, weeklyReflection, type Reflection } from "./ai";
import type { Goal, QuizQuestion, Summary, Video } from "./types";

export function getVideo(id: string) {
  return get<Video>("SELECT * FROM videos WHERE id = ?", id);
}

export type PathStep = Video & { why: string; position: number; section_id: number | null; played: number | null };

/** A path's videos, grouped into its sections and numbered. */
export function pathOutline(pathId: number) {
  const sections = all<{ id: number; title: string }>("SELECT id, title FROM path_sections WHERE path_id = ? ORDER BY position, id", pathId);
  const items = all<PathStep>(
    `SELECT v.*, i.why, i.position, i.section_id, (SELECT SUM(w.seconds) FROM watch_sessions w WHERE w.video_id = v.id) AS played
     FROM path_items i JOIN videos v ON v.id = i.video_id WHERE i.path_id = ? ORDER BY i.position`,
    pathId,
  );
  return groupSteps(sections, items);
}

/** The Watch later playlist, in saved order. Finished videos leave it. */
export function watchLaterList() {
  return all<Video>("SELECT * FROM videos WHERE watch_later > 0 AND completed_at IS NULL ORDER BY watch_later, id");
}

/** Transcript is fetched once and cached; status records failures so we don't retry every view. */
export async function ensureTranscript(v: Video): Promise<string | null> {
  if (v.transcript) return v.transcript;
  if (v.transcript_status === "unavailable") return null;
  const t = await fetchTranscript(v.id);
  run("UPDATE videos SET transcript = ?, transcript_status = ? WHERE id = ?", t, t ? "ok" : "unavailable", v.id);
  return t;
}

export async function ensureSummary(v: Video): Promise<Summary> {
  if (v.summary) return JSON.parse(v.summary) as Summary;
  const transcript = await ensureTranscript(v);
  const goals = all<Goal>("SELECT * FROM goals").map((g) => g.name);
  const s = await summarize({ title: v.title, channel: v.channel_title, description: v.description, transcript, goals });
  run("UPDATE videos SET summary = ? WHERE id = ?", JSON.stringify(s), v.id);
  return s;
}

/** Best study material available for a video: transcript, else summary + description + notes. */
async function material(v: Video): Promise<string> {
  const notes = all<{ text: string }>("SELECT text FROM notes WHERE video_id = ? ORDER BY ts_sec", v.id).map((n) => `- ${n.text}`);
  const transcript = await ensureTranscript(v);
  const parts = [transcript ? `Transcript:\n${transcript}` : `Description:\n${v.description}`];
  if (v.summary) {
    const s = JSON.parse(v.summary) as Summary;
    parts.push(`Summary: ${s.tldr}\nKey points:\n${s.key_points.map((p) => `- ${p}`).join("\n")}`);
  }
  if (notes.length) parts.push(`The viewer's own notes:\n${notes.join("\n")}`);
  return parts.join("\n\n");
}

export async function ensureQuiz(v: Video): Promise<QuizQuestion[]> {
  const row = get<{ questions: string }>("SELECT questions FROM quizzes WHERE video_id = ?", v.id);
  if (row) return JSON.parse(row.questions) as QuizQuestion[];
  const qs = await makeQuiz({ title: v.title, material: await material(v) });
  run("INSERT OR REPLACE INTO quizzes (video_id, questions) VALUES (?, ?)", v.id, JSON.stringify(qs));
  return qs;
}

export async function generateFlashcards(v: Video): Promise<number> {
  const cards = await makeFlashcards({ title: v.title, material: await material(v) });
  const day = today();
  tx(() => {
    for (const c of cards) run("INSERT INTO flashcards (video_id, front, back, due_day) VALUES (?, ?, ?, ?)", v.id, c.front, c.back, addDays(day, 1));
  });
  return cards.length;
}

/**
 * SM-2 spaced repetition. grade: 0 = forgot, 1 = hard, 2 = good, 3 = easy.
 */
export function reviewCard(id: number, grade: 0 | 1 | 2 | 3) {
  const c = get<{ ease: number; interval_days: number; reps: number }>("SELECT ease, interval_days, reps FROM flashcards WHERE id = ?", id);
  if (!c) return;
  const q = [1, 3, 4, 5][grade];
  let { ease, interval_days: interval, reps } = c;
  if (q < 3) {
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(interval * ease);
    if (grade === 3) interval = Math.round(interval * 1.3);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  run("UPDATE flashcards SET ease = ?, interval_days = ?, reps = ?, due_day = ? WHERE id = ?", ease, interval, reps, addDays(today(), interval), id);
}

/* ------------------------------- Statistics ------------------------------ */

export type Stats = ReturnType<typeof getStats>;

export function getStats() {
  const day = today();
  const since30 = addDays(day, -29);
  const perGoal = all<{ goal: string | null; seconds: number }>(
    `SELECT g.name AS goal, SUM(w.seconds) AS seconds
     FROM watch_sessions w JOIN videos v ON v.id = w.video_id LEFT JOIN goals g ON g.id = v.goal_id
     WHERE w.day >= ? GROUP BY g.name ORDER BY seconds DESC`,
    since30,
  );
  const perDay = all<{ day: string; seconds: number }>(
    "SELECT day, SUM(seconds) AS seconds FROM watch_sessions WHERE day >= ? GROUP BY day ORDER BY day",
    addDays(day, -13),
  );
  const activeDays = new Set(
    all<{ day: string }>(
      `SELECT day FROM watch_sessions GROUP BY day HAVING SUM(seconds) >= 60
       UNION SELECT date(done_at, 'localtime') FROM actions WHERE done_at IS NOT NULL
       UNION SELECT date(created_at, 'localtime') FROM quiz_attempts
       UNION SELECT date(completed_at, 'localtime') FROM videos WHERE completed_at IS NOT NULL`,
    ).map((r) => r.day),
  );
  let streak = 0;
  for (let d = activeDays.has(day) ? day : addDays(day, -1); activeDays.has(d); d = addDays(d, -1)) streak++;

  const completed = get<{ n: number }>("SELECT COUNT(*) AS n FROM videos WHERE completed_at IS NOT NULL")?.n ?? 0;
  const completed7 = get<{ n: number }>("SELECT COUNT(*) AS n FROM videos WHERE completed_at >= datetime('now', '-7 days')")?.n ?? 0;
  const quiz = get<{ c: number | null; t: number | null }>("SELECT SUM(correct) AS c, SUM(total) AS t FROM quiz_attempts")!;
  const actions = get<{ open: number; done: number }>("SELECT SUM(done = 0) AS open, SUM(done = 1) AS done FROM actions")!;
  const dueCards = get<{ n: number }>("SELECT COUNT(*) AS n FROM flashcards WHERE due_day <= ?", day)?.n ?? 0;
  const totalCards = get<{ n: number }>("SELECT COUNT(*) AS n FROM flashcards")?.n ?? 0;
  const notes = get<{ n: number }>("SELECT COUNT(*) AS n FROM notes")?.n ?? 0;
  const totalSeconds = get<{ s: number | null }>("SELECT SUM(seconds) AS s FROM watch_sessions")?.s ?? 0;

  return {
    perGoal,
    perDay,
    streak,
    completed,
    completed7,
    quizPct: quiz.t ? Math.round((100 * (quiz.c ?? 0)) / quiz.t) : null,
    actionsOpen: actions.open ?? 0,
    actionsDone: actions.done ?? 0,
    dueCards,
    totalCards,
    notes,
    totalSeconds,
  };
}

/* --------------------------- Weekly reflection --------------------------- */

export async function createReflection(): Promise<Reflection> {
  const start = weekStart();
  const watched = all<{ title: string; channel_title: string; goal: string | null; seconds: number; intent: string }>(
    `SELECT v.title, v.channel_title, g.name AS goal, SUM(w.seconds) AS seconds, GROUP_CONCAT(w.intent, ' | ') AS intent
     FROM watch_sessions w JOIN videos v ON v.id = w.video_id LEFT JOIN goals g ON g.id = v.goal_id
     WHERE w.day >= ? GROUP BY v.id ORDER BY seconds DESC LIMIT 40`,
    start,
  );
  const summaries = all<{ title: string; summary: string }>(
    `SELECT DISTINCT v.title, v.summary FROM watch_sessions w JOIN videos v ON v.id = w.video_id WHERE w.day >= ? AND v.summary IS NOT NULL LIMIT 15`,
    start,
  );
  const notes = all<{ text: string; title: string }>(
    "SELECT n.text, v.title FROM notes n JOIN videos v ON v.id = n.video_id WHERE date(n.created_at, 'localtime') >= ? LIMIT 60",
    start,
  );
  const actions = all<{ text: string; done: number }>(
    "SELECT text, done FROM actions WHERE date(created_at, 'localtime') >= ? OR date(done_at, 'localtime') >= ?",
    start,
    start,
  );
  const quiz = all<{ title: string; correct: number; total: number }>(
    "SELECT v.title, q.correct, q.total FROM quiz_attempts q JOIN videos v ON v.id = q.video_id WHERE date(q.created_at, 'localtime') >= ?",
    start,
  );
  const goals = all<Goal>("SELECT * FROM goals").map((g) => g.name);

  const data = [
    `Week starting ${start}. Goals: ${goals.join(", ") || "none set"}.`,
    `Watched:\n${watched.map((w) => `- "${w.title}" (${w.channel_title}) goal=${w.goal ?? "none"} ${Math.round(w.seconds / 60)} min; intent: ${w.intent}`).join("\n") || "- nothing"}`,
    `Summaries of watched videos:\n${summaries.map((s) => `- ${s.title}: ${(JSON.parse(s.summary) as Summary).tldr}`).join("\n") || "- none"}`,
    `Notes taken:\n${notes.map((n) => `- (${n.title}) ${n.text}`).join("\n") || "- none"}`,
    `Action steps:\n${actions.map((a) => `- [${a.done ? "done" : "open"}] ${a.text}`).join("\n") || "- none"}`,
    `Quiz results:\n${quiz.map((q) => `- ${q.title}: ${q.correct}/${q.total}`).join("\n") || "- none"}`,
  ].join("\n\n");

  const r = await weeklyReflection(data);
  run("INSERT INTO reflections (week_start, content) VALUES (?, ?)", start, JSON.stringify(r));
  return r;
}
