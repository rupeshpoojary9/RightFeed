import "server-only";
import crypto from "node:crypto";
import { all, get, run, tx } from "./db";
import { getSettings, saveSettings, hasYouTubeKey, hasAi, type Settings } from "./settings";
import { fetchChannelFeed, fetchGenericFeed, fetchVideoDetails, searchVideos, type FeedVideo } from "./youtube";
import { judge, type JudgeInput, type Verdict } from "./ai";
import type { Goal, Source, Video, Reading } from "./types";
import { today } from "./dates";

export type RefreshReport = {
  fetched: number;
  newVideos: number;
  newReadings: number;
  filtered: number;
  scored: number;
  errors: string[];
  aiUsed: boolean;
};

const SEARCH_INTERVAL_MS = 24 * 3600 * 1000;
const SCORE_BATCH = 12;
const MAX_SCORE_PER_RUN = 120;

let running: Promise<RefreshReport> | null = null;

/** Refresh is single-flight: concurrent callers share one run. */
export function refresh(opts: { force?: boolean } = {}): Promise<RefreshReport> {
  running ??= doRefresh(opts).finally(() => {
    running = null;
  });
  return running;
}

export function isRefreshing() {
  return running !== null;
}

/** Kick off a refresh in the background if the last one is older than 6 hours. */
export function maybeAutoRefresh() {
  const s = getSettings();
  if (!s.onboarded || running) return;
  const last = s.lastRefreshAt ? new Date(s.lastRefreshAt).getTime() : 0;
  if (Date.now() - last > 6 * 3600 * 1000) {
    refresh().catch((e) => console.error("[mytube] auto refresh failed", e));
  }
}

async function doRefresh({ force = false }: { force?: boolean }): Promise<RefreshReport> {
  const report: RefreshReport = { fetched: 0, newVideos: 0, newReadings: 0, filtered: 0, scored: 0, errors: [], aiUsed: hasAi() };
  const settings = getSettings();
  const sources = all<Source>("SELECT * FROM sources WHERE blocked = 0");
  const goals = all<Goal>("SELECT * FROM goals");

  // 1. Trusted channels via RSS (free).
  for (const src of sources.filter((s) => s.kind === "channel")) {
    try {
      const { title, videos } = await fetchChannelFeed(src.ref);
      report.fetched += videos.length;
      report.newVideos += insertVideos(videos, "channel", null);
      run("UPDATE sources SET last_fetched_at = datetime('now'), last_error = NULL, title = COALESCE(NULLIF(title, ''), ?) WHERE id = ?", title, src.id);
    } catch (e) {
      const msg = errMsg(e);
      run("UPDATE sources SET last_error = ? WHERE id = ?", msg, src.id);
      report.errors.push(`${src.title || src.ref}: ${msg}`);
    }
  }

  // 2. Goal-based discovery via the YouTube API (once a day per goal: ~200 quota units each).
  if (hasYouTubeKey()) {
    for (const goal of goals) {
      const q = goal.search_query || goal.name;
      const last = goal.last_searched_at ? new Date(goal.last_searched_at).getTime() : 0;
      if (!force && Date.now() - last < SEARCH_INTERVAL_MS) continue;
      try {
        const videos = await searchVideos(q);
        report.fetched += videos.length;
        report.newVideos += insertVideos(videos, "search", goal.id);
        run("UPDATE goals SET last_searched_at = datetime('now') WHERE id = ?", goal.id);
      } catch (e) {
        report.errors.push(`Search "${q}": ${errMsg(e)}`);
      }
    }

    // 3. Durations for anything we don't know yet (needed to drop Shorts reliably).
    const missing = all<{ id: string }>("SELECT id FROM videos WHERE duration_sec IS NULL AND status = 'new' LIMIT 500").map((r) => r.id);
    if (missing.length) {
      try {
        const details = await fetchVideoDetails(missing);
        tx(() => {
          for (const [id, d] of details) {
            run("UPDATE videos SET duration_sec = ?, description = CASE WHEN length(?) > length(description) THEN ? ELSE description END WHERE id = ?", d.durationSec, d.description, d.description, id);
          }
        });
      } catch (e) {
        report.errors.push(`Video details: ${errMsg(e)}`);
      }
    }
  }

  // 4. Articles and podcasts.
  for (const src of sources.filter((s) => s.kind === "feed")) {
    try {
      const { title, items } = await fetchGenericFeed(src.ref);
      report.fetched += items.length;
      tx(() => {
        for (const it of items.slice(0, 30)) {
          const id = crypto.createHash("sha1").update(`${src.id}:${it.id}`).digest("hex").slice(0, 20);
          const r = run(
            "INSERT OR IGNORE INTO readings (id, source_id, source_title, title, link, summary, kind, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            id, src.id, src.title || title, it.title, it.link, it.summary, it.kind, it.publishedAt,
          );
          report.newReadings += Number(r.changes);
        }
      });
      run("UPDATE sources SET last_fetched_at = datetime('now'), last_error = NULL, title = COALESCE(NULLIF(title, ''), ?) WHERE id = ?", title, src.id);
    } catch (e) {
      const msg = errMsg(e);
      run("UPDATE sources SET last_error = ? WHERE id = ?", msg, src.id);
      report.errors.push(`${src.title || src.ref}: ${msg}`);
    }
  }

  // 5. Hard rules, then the judge.
  report.filtered += applyHardRules(settings);
  try {
    report.scored += await scorePending(settings, goals);
  } catch (e) {
    report.errors.push(`AI judge: ${errMsg(e)}`);
  }

  saveSettings({ lastRefreshAt: new Date().toISOString() });
  return report;
}

function insertVideos(videos: FeedVideo[], origin: string, goalId: number | null): number {
  let n = 0;
  tx(() => {
    for (const v of videos) {
      const r = run(
        `INSERT OR IGNORE INTO videos (id, channel_id, channel_title, title, description, published_at, duration_sec, thumbnail, is_short, origin, origin_goal_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        v.id, v.channelId, v.channelTitle, v.title, v.description, v.publishedAt, v.durationSec,
        v.thumbnail ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, v.isShort ? 1 : 0, origin, goalId,
      );
      n += Number(r.changes);
    }
  });
  return n;
}

/** Cheap deterministic filters that run before any AI call. Returns how many items were dropped. */
export function applyHardRules(s: Settings): number {
  const blockedChannels = new Set(all<{ ref: string }>("SELECT ref FROM sources WHERE kind = 'channel' AND blocked = 1").map((r) => r.ref));
  const keywords = s.blockedKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
  let dropped = 0;

  const pending = all<Video>("SELECT * FROM videos WHERE status = 'new'");
  tx(() => {
    for (const v of pending) {
      const reason = videoRuleViolation(v, s, keywords, blockedChannels);
      if (reason) {
        run("UPDATE videos SET status = 'filtered', filter_reason = ? WHERE id = ?", reason, v.id);
        dropped++;
      }
    }
    for (const r of all<Reading>("SELECT * FROM readings WHERE status = 'new'")) {
      const hay = `${r.title} ${r.summary}`.toLowerCase();
      const kw = keywords.find((k) => hay.includes(k));
      if (kw) {
        run("UPDATE readings SET status = 'filtered', filter_reason = ? WHERE id = ?", `Blocked keyword "${kw}"`, r.id);
        dropped++;
      }
    }
  });
  return dropped;
}

function videoRuleViolation(v: Video, s: Settings, keywords: string[], blockedChannels: Set<string>): string | null {
  if (blockedChannels.has(v.channel_id)) return "Blocked channel";
  if (v.is_short) return "YouTube Short";
  if (v.duration_sec != null) {
    if (v.duration_sec > 0 && v.duration_sec < s.minDurationMin * 60) return `Shorter than ${s.minDurationMin} min`;
    if (s.maxDurationMin > 0 && v.duration_sec > s.maxDurationMin * 60) return `Longer than ${s.maxDurationMin} min`;
  }
  const hay = `${v.title} ${v.description.slice(0, 500)}`.toLowerCase();
  const kw = keywords.find((k) => hay.includes(k));
  if (kw) return `Blocked keyword "${kw}"`;
  return null;
}

/** Score everything that passed the hard rules. Uses Claude when configured, else a keyword heuristic. */
export async function scorePending(s: Settings, goals: Goal[]): Promise<number> {
  const videos = all<Video>("SELECT * FROM videos WHERE status = 'new' ORDER BY published_at DESC LIMIT ?", MAX_SCORE_PER_RUN);
  const readings = all<Reading>("SELECT * FROM readings WHERE status = 'new' ORDER BY published_at DESC LIMIT ?", MAX_SCORE_PER_RUN);
  const inputs: JudgeInput[] = [
    ...videos.map((v) => ({
      id: `v:${v.id}`,
      title: v.title,
      channel: v.channel_title,
      description: v.description,
      durationMin: v.duration_sec != null ? Math.round(v.duration_sec / 60) : null,
      kind: "video" as const,
    })),
    ...readings.map((r) => ({ id: `r:${r.id}`, title: r.title, channel: r.source_title, description: r.summary, durationMin: null, kind: r.kind })),
  ];
  if (!inputs.length) return 0;

  const trusted = new Set(all<{ ref: string }>("SELECT ref FROM sources WHERE kind = 'channel' AND trusted = 1").map((r) => r.ref));
  const goalByName = new Map(goals.map((g) => [g.name.toLowerCase(), g.id]));
  let scored = 0;

  if (hasAi()) {
    const taste = all<{ title: string; value: number }>(
      "SELECT v.title, f.value FROM feedback f JOIN videos v ON v.id = f.video_id ORDER BY f.created_at DESC LIMIT 40",
    );
    const ctx = {
      goals: goals.map((g) => ({ name: g.name, description: g.description })),
      rules: s.rules,
      liked: taste.filter((t) => t.value > 0).map((t) => t.title).slice(0, 20),
      disliked: taste.filter((t) => t.value < 0).map((t) => t.title).slice(0, 20),
    };
    for (let i = 0; i < inputs.length; i += SCORE_BATCH) {
      const batch = inputs.slice(i, i + SCORE_BATCH);
      const verdicts = await judge(batch, ctx);
      scored += saveVerdicts(verdicts, goalByName);
    }
  } else {
    const verdicts = inputs.map((it) => heuristicVerdict(it, goals, trusted, videos));
    scored += saveVerdicts(verdicts, goalByName);
  }
  return scored;
}

function saveVerdicts(verdicts: Verdict[], goalByName: Map<string, number>): number {
  let n = 0;
  tx(() => {
    for (const v of verdicts) {
      const goalId = v.goal ? goalByName.get(v.goal.toLowerCase()) ?? null : null;
      const [kind, id] = [v.id.slice(0, 1), v.id.slice(2)];
      const table = kind === "v" ? "videos" : "readings";
      const r = run(`UPDATE ${table} SET status = 'scored', score = ?, score_reason = ?, goal_id = COALESCE(?, goal_id) WHERE id = ? AND status = 'new'`, v.score, v.reason, goalId, id);
      n += Number(r.changes);
    }
  });
  return n;
}

const STOP = new Set("the a an and or of to in for on with how what why is are my your you i be at by from it this that".split(" "));
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Fallback when no AI key is configured: goal keyword overlap + trusted-channel bonus. */
function heuristicVerdict(it: JudgeInput, goals: Goal[], trusted: Set<string>, videos: Video[]): Verdict {
  const hay = new Set(words(`${it.title} ${it.description.slice(0, 600)}`));
  let best: { goal: Goal; hits: number } | null = null;
  for (const g of goals) {
    const gw = words(`${g.name} ${g.description} ${g.search_query}`);
    const hits = gw.filter((w) => hay.has(w)).length;
    if (hits && (!best || hits > best.hits)) best = { goal: g, hits };
  }
  const video = it.kind === "video" ? videos.find((v) => `v:${v.id}` === it.id) : undefined;
  const isTrusted = video ? trusted.has(video.channel_id) : true;
  const fromGoalSearch = video?.origin === "search";
  let score = isTrusted ? 7 : fromGoalSearch ? 6 : 5;
  if (best) score += Math.min(2, best.hits);
  if (/[!?]{2,}|you won't believe|shocking|insane|gone wrong/i.test(it.title)) score -= 3;
  score = Math.max(0, Math.min(10, score));
  const reason = [
    isTrusted ? "From a channel you trust" : fromGoalSearch ? "Found by searching your goals" : "From your feeds",
    best ? `matches "${best.goal.name}"` : null,
    "(basic scoring: add an Anthropic API key for the AI judge)",
  ]
    .filter(Boolean)
    .join(", ");
  const goal = best?.goal.name ?? (video?.origin_goal_id ? goals.find((g) => g.id === video.origin_goal_id)?.name ?? null : null);
  return { id: it.id, score, goal, reason };
}

/** Re-run the judge on everything (after rules/goals change). Watched videos keep their history. */
export function resetScores() {
  run("UPDATE videos SET status = 'new', score = NULL, score_reason = NULL, filter_reason = NULL WHERE completed_at IS NULL");
  run("UPDATE readings SET status = 'new', score = NULL, score_reason = NULL, filter_reason = NULL WHERE done = 0");
  const day = today();
  // Picks the user hasn't started yet get rebuilt with the new rules.
  run("DELETE FROM daily_picks WHERE day = ? AND video_id NOT IN (SELECT video_id FROM watch_sessions WHERE day = ?)", day, day);
}

/* ------------------------------ Daily picks ------------------------------ */

/**
 * A fixed set of picks per day, balanced across goals (round-robin by score).
 * Once chosen, today's set doesn't change: there's no endless scroll.
 */
export function getDailyPicks(day = today()): Video[] {
  const s = getSettings();
  const existing = all<Video>(
    "SELECT v.* FROM daily_picks p JOIN videos v ON v.id = p.video_id WHERE p.day = ? ORDER BY p.position",
    day,
  );
  if (existing.length >= s.dailyPicks) return existing;

  const taken = new Set(existing.map((v) => v.id));
  const pool = all<Video>(
    `SELECT * FROM videos
     WHERE status = 'scored' AND score >= ? AND completed_at IS NULL
       AND id NOT IN (SELECT video_id FROM feedback WHERE value < 0)
     ORDER BY score DESC, published_at DESC`,
    s.threshold,
  ).filter((v) => !taken.has(v.id));
  // Videos offered on earlier days but skipped go to the back of the queue, so
  // each day brings something fresh while good videos aren't lost forever.
  const offeredBefore = new Set(all<{ video_id: string }>("SELECT video_id FROM daily_picks WHERE day < ?", day).map((r) => r.video_id));
  pool.sort((a, b) => Number(offeredBefore.has(a.id)) - Number(offeredBefore.has(b.id)));
  if (!pool.length) return existing;

  const byGoal = new Map<number | null, Video[]>();
  for (const v of pool) {
    const k = v.goal_id ?? null;
    if (!byGoal.has(k)) byGoal.set(k, []);
    byGoal.get(k)!.push(v);
  }
  const queues = [...byGoal.values()];
  const chosen: Video[] = [];
  while (chosen.length + existing.length < s.dailyPicks && queues.some((q) => q.length)) {
    for (const q of queues) {
      const v = q.shift();
      if (v) chosen.push(v);
      if (chosen.length + existing.length >= s.dailyPicks) break;
    }
  }
  tx(() => {
    chosen.forEach((v, i) => run("INSERT OR IGNORE INTO daily_picks (day, video_id, position) VALUES (?, ?, ?)", day, v.id, existing.length + i));
  });
  return [...existing, ...chosen];
}

/* --------------------------------- Budget -------------------------------- */

export function secondsWatchedToday(day = today()): number {
  return get<{ s: number | null }>("SELECT SUM(seconds) AS s FROM watch_sessions WHERE day = ?", day)?.s ?? 0;
}

export function budgetStatus() {
  const s = getSettings();
  const used = secondsWatchedToday();
  const budget = s.dailyBudgetMin * 60;
  return { used, budget, remaining: Math.max(0, budget - used), locked: budget > 0 && used >= budget };
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
