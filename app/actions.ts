"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, get, run, tx } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/settings";
import { refresh, resetScores, budgetStatus, applyHardRules, scorePending, type RefreshReport } from "@/lib/ingest";
import { resolveChannel, fetchGenericFeed } from "@/lib/youtube";
import { buildPath, AiUnavailableError, type JudgeInput } from "@/lib/ai";
import {
  createReflection,
  ensureQuiz,
  ensureSummary,
  generateFlashcards,
  getVideo,
  reviewCard,
} from "@/lib/learn";
import { today } from "@/lib/dates";
import type { Goal, QuizQuestion, Summary, Video } from "@/lib/types";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof AiUnavailableError) return { ok: false, error: e.message };
  console.error("[mytube]", e);
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/* ------------------------------- Settings -------------------------------- */

export async function saveSettingsAction(fd: FormData) {
  const prev = getSettings();
  const num = (k: string, d: number, min: number, max: number) => {
    const n = Number(fd.get(k));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
  };
  const next = {
    rules: str(fd, "rules").replace(/\r\n?/g, "\n") || prev.rules,
    blockedKeywords: str(fd, "blockedKeywords").split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
    minDurationMin: num("minDurationMin", prev.minDurationMin, 0, 120),
    maxDurationMin: num("maxDurationMin", prev.maxDurationMin, 0, 600),
    threshold: num("threshold", prev.threshold, 0, 10),
    dailyBudgetMin: num("dailyBudgetMin", prev.dailyBudgetMin, 0, 600),
    dailyPicks: num("dailyPicks", prev.dailyPicks, 1, 50),
  };
  saveSettings(next);
  const judgeChanged =
    next.rules !== prev.rules ||
    next.blockedKeywords.join() !== prev.blockedKeywords.join() ||
    next.minDurationMin !== prev.minDurationMin ||
    next.maxDurationMin !== prev.maxDurationMin;
  if (judgeChanged && fd.get("rejudge") === "on") {
    resetScores();
    const s = getSettings();
    applyHardRules(s);
    try {
      await scorePending(s, all<Goal>("SELECT * FROM goals"));
    } catch (e) {
      console.error("[mytube] re-judge after settings change failed", e);
    }
  } else {
    applyHardRules(getSettings());
  }
  revalidatePath("/", "layout");
}

export async function finishOnboarding() {
  saveSettings({ onboarded: true });
  try {
    await refresh({ force: true });
  } catch (e) {
    console.error("[mytube] first refresh failed", e);
  }
  redirect("/");
}

/* --------------------------------- Goals --------------------------------- */

export async function addGoal(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  run("INSERT INTO goals (name, description, search_query) VALUES (?, ?, ?)", name, str(fd, "description"), str(fd, "search_query") || name);
  revalidatePath("/", "layout");
}

export async function updateGoal(fd: FormData) {
  const id = Number(fd.get("id"));
  run("UPDATE goals SET name = ?, description = ?, search_query = ?, last_searched_at = NULL WHERE id = ?", str(fd, "name"), str(fd, "description"), str(fd, "search_query"), id);
  revalidatePath("/", "layout");
}

export async function deleteGoal(fd: FormData) {
  const id = Number(fd.get("id"));
  run("DELETE FROM goals WHERE id = ?", id);
  run("UPDATE videos SET goal_id = NULL WHERE goal_id = ?", id);
  revalidatePath("/", "layout");
}

/* -------------------------------- Sources -------------------------------- */

export async function addChannel(_: unknown, fd: FormData): Promise<Result<string>> {
  const input = str(fd, "channel");
  if (!input) return { ok: false, error: "Paste a channel link or @handle" };
  try {
    const ch = await resolveChannel(input);
    run(
      "INSERT INTO sources (kind, ref, title, trusted, blocked) VALUES ('channel', ?, ?, 1, 0) ON CONFLICT(kind, ref) DO UPDATE SET trusted = 1, blocked = 0, title = excluded.title",
      ch.id,
      ch.title,
    );
    revalidatePath("/", "layout");
    return { ok: true, data: ch.title || ch.id };
  } catch (e) {
    return fail(e);
  }
}

export async function addFeed(_: unknown, fd: FormData): Promise<Result<string>> {
  const url = str(fd, "url");
  if (!/^https?:\/\//.test(url)) return { ok: false, error: "Enter the full feed URL (https://…)" };
  try {
    const f = await fetchGenericFeed(url);
    run("INSERT OR IGNORE INTO sources (kind, ref, title) VALUES ('feed', ?, ?)", url, f.title);
    revalidatePath("/", "layout");
    return { ok: true, data: f.title || url };
  } catch (e) {
    return fail(e);
  }
}

export async function removeSource(fd: FormData) {
  run("DELETE FROM sources WHERE id = ?", Number(fd.get("id")));
  revalidatePath("/", "layout");
}

/** Never show this channel again (also removes its unwatched videos from the feed). */
export async function blockChannel(channelId: string, title: string) {
  tx(() => {
    run(
      "INSERT INTO sources (kind, ref, title, trusted, blocked) VALUES ('channel', ?, ?, 0, 1) ON CONFLICT(kind, ref) DO UPDATE SET blocked = 1, trusted = 0",
      channelId,
      title,
    );
    run("UPDATE videos SET status = 'filtered', filter_reason = 'Blocked channel' WHERE channel_id = ? AND completed_at IS NULL", channelId);
    run("DELETE FROM daily_picks WHERE day = ? AND video_id IN (SELECT id FROM videos WHERE channel_id = ?)", today(), channelId);
  });
  revalidatePath("/", "layout");
}

export async function unblockSource(fd: FormData) {
  const id = Number(fd.get("id"));
  const src = get<{ ref: string }>("SELECT ref FROM sources WHERE id = ?", id);
  run("DELETE FROM sources WHERE id = ?", id);
  if (src) run("UPDATE videos SET status = 'new', filter_reason = NULL WHERE channel_id = ? AND filter_reason = 'Blocked channel'", src.ref);
  revalidatePath("/", "layout");
}

/* -------------------------------- Refresh -------------------------------- */

export async function refreshNow(): Promise<Result<RefreshReport>> {
  try {
    const r = await refresh({ force: true });
    revalidatePath("/", "layout");
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}

export async function rejudgeAll(): Promise<Result<RefreshReport>> {
  resetScores();
  return refreshNow();
}

/* ------------------------------- Watching -------------------------------- */

export async function startWatch(videoId: string, intent: string): Promise<Result<{ sessionId: number; remaining: number }>> {
  const b = budgetStatus();
  if (b.locked) return { ok: false, error: "Daily budget used up" };
  const r = run("INSERT INTO watch_sessions (video_id, day, intent) VALUES (?, ?, ?)", videoId, today(), intent.slice(0, 500));
  return { ok: true, data: { sessionId: Number(r.lastInsertRowid), remaining: b.remaining } };
}

/** Called every few seconds while the video is actually playing. */
export async function tickWatch(sessionId: number, seconds: number): Promise<{ remaining: number; locked: boolean }> {
  const s = Math.max(0, Math.min(120, Math.round(seconds)));
  if (s) run("UPDATE watch_sessions SET seconds = seconds + ? WHERE id = ?", s, sessionId);
  const b = budgetStatus();
  return { remaining: b.remaining, locked: b.locked };
}

export async function markCompleted(videoId: string) {
  run("UPDATE videos SET completed_at = COALESCE(completed_at, datetime('now')), watch_later = 0 WHERE id = ?", videoId);
  revalidatePath("/", "layout");
}

export async function setFeedback(videoId: string, value: -1 | 0 | 1) {
  if (value === 0) run("DELETE FROM feedback WHERE video_id = ?", videoId);
  else run("INSERT INTO feedback (video_id, value) VALUES (?, ?) ON CONFLICT(video_id) DO UPDATE SET value = excluded.value, created_at = datetime('now')", videoId, value);
  revalidatePath("/", "layout");
}

export async function toggleWatchLater(videoId: string) {
  run("UPDATE videos SET watch_later = 1 - watch_later WHERE id = ?", videoId);
  revalidatePath("/", "layout");
}

/** Pull a filtered-out video back in (the judge or rules got it wrong). */
export async function rescueVideo(fd: FormData) {
  const id = str(fd, "id");
  run("UPDATE videos SET status = 'scored', score = 10, score_reason = 'You chose this one', filter_reason = NULL, watch_later = 1 WHERE id = ?", id);
  run("INSERT INTO feedback (video_id, value) VALUES (?, 1) ON CONFLICT(video_id) DO UPDATE SET value = 1", id);
  revalidatePath("/", "layout");
}

/* --------------------------------- Notes --------------------------------- */

export async function addNote(videoId: string, tsSec: number, text: string) {
  if (text.trim()) run("INSERT INTO notes (video_id, ts_sec, text) VALUES (?, ?, ?)", videoId, Math.max(0, Math.floor(tsSec)), text.trim());
  return all<{ id: number; ts_sec: number; text: string; created_at: string; video_id: string }>("SELECT * FROM notes WHERE video_id = ? ORDER BY ts_sec", videoId);
}

export async function deleteNote(id: number, videoId: string) {
  run("DELETE FROM notes WHERE id = ?", id);
  return all<{ id: number; ts_sec: number; text: string; created_at: string; video_id: string }>("SELECT * FROM notes WHERE video_id = ? ORDER BY ts_sec", videoId);
}

/* ---------------------------------- AI ----------------------------------- */

function mustVideo(id: string): Video {
  const v = getVideo(id);
  if (!v) throw new Error("Video not found");
  return v;
}

export async function getSummary(videoId: string): Promise<Result<Summary>> {
  try {
    return { ok: true, data: await ensureSummary(mustVideo(videoId)) };
  } catch (e) {
    return fail(e);
  }
}

export async function getQuiz(videoId: string): Promise<Result<QuizQuestion[]>> {
  try {
    return { ok: true, data: await ensureQuiz(mustVideo(videoId)) };
  } catch (e) {
    return fail(e);
  }
}

export async function recordQuiz(videoId: string, correct: number, total: number) {
  run("INSERT INTO quiz_attempts (video_id, correct, total) VALUES (?, ?, ?)", videoId, correct, total);
  revalidatePath("/progress");
}

export async function makeCards(videoId: string): Promise<Result<number>> {
  try {
    const n = await generateFlashcards(mustVideo(videoId));
    revalidatePath("/review");
    return { ok: true, data: n };
  } catch (e) {
    return fail(e);
  }
}

export async function addCard(fd: FormData) {
  const front = str(fd, "front");
  const back = str(fd, "back");
  if (!front || !back) return;
  run("INSERT INTO flashcards (video_id, front, back, due_day) VALUES (?, ?, ?, ?)", str(fd, "video_id") || null, front, back, today());
  revalidatePath("/review");
}

export async function gradeCard(id: number, grade: 0 | 1 | 2 | 3) {
  reviewCard(id, grade);
  revalidatePath("/review");
}

export async function deleteCard(id: number) {
  run("DELETE FROM flashcards WHERE id = ?", id);
  revalidatePath("/review");
}

/* -------------------------------- Actions -------------------------------- */

export async function addAction(videoId: string | null, text: string): Promise<number | null> {
  if (!text.trim()) return null;
  const r = run("INSERT INTO actions (video_id, text) VALUES (?, ?)", videoId, text.trim());
  revalidatePath("/", "layout");
  return Number(r.lastInsertRowid);
}

export async function toggleAction(id: number) {
  run("UPDATE actions SET done = 1 - done, done_at = CASE WHEN done = 0 THEN datetime('now') ELSE NULL END WHERE id = ?", id);
  revalidatePath("/", "layout");
}

export async function deleteAction(id: number) {
  run("DELETE FROM actions WHERE id = ?", id);
  revalidatePath("/", "layout");
}

/* -------------------------------- Readings ------------------------------- */

export async function markReadingDone(id: string) {
  run("UPDATE readings SET done = 1 WHERE id = ?", id);
  revalidatePath("/");
}

/* ----------------------------- Learning paths ---------------------------- */

export async function createPath(_: unknown, fd: FormData): Promise<Result<number>> {
  const goalId = Number(fd.get("goal_id"));
  const goal = get<Goal>("SELECT * FROM goals WHERE id = ?", goalId);
  if (!goal) return { ok: false, error: "Choose a goal" };
  const pool = all<Video>(
    "SELECT * FROM videos WHERE status = 'scored' AND (goal_id = ? OR origin_goal_id = ?) ORDER BY score DESC LIMIT 40",
    goalId,
    goalId,
  );
  if (pool.length < 3) return { ok: false, error: "Not enough good videos for this goal yet. Refresh your feed or add channels first." };
  try {
    const inputs: JudgeInput[] = pool.map((v) => ({
      id: v.id,
      title: v.title,
      channel: v.channel_title,
      description: v.description,
      durationMin: v.duration_sec ? Math.round(v.duration_sec / 60) : null,
      kind: "video",
    }));
    const p = await buildPath(goal, inputs);
    const ids = new Set(pool.map((v) => v.id));
    const steps = p.steps.filter((s) => ids.has(s.id));
    if (!steps.length) return { ok: false, error: "The AI couldn't build a path from these videos" };
    const pathId = tx(() => {
      const r = run("INSERT INTO paths (goal_id, title, description) VALUES (?, ?, ?)", goalId, p.title, p.description);
      const id = Number(r.lastInsertRowid);
      steps.forEach((s, i) => run("INSERT OR IGNORE INTO path_items (path_id, position, video_id, why) VALUES (?, ?, ?, ?)", id, i, s.id, s.why));
      return id;
    });
    revalidatePath("/paths");
    return { ok: true, data: pathId };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePath(fd: FormData) {
  const id = Number(fd.get("id"));
  run("DELETE FROM path_items WHERE path_id = ?", id);
  run("DELETE FROM paths WHERE id = ?", id);
  redirect("/paths");
}

/* ------------------------------- Reflection ------------------------------ */

export async function generateReflection(): Promise<Result<null>> {
  try {
    await createReflection();
    revalidatePath("/progress");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}
