import "server-only";
import crypto from "node:crypto";
import { all, get, run } from "./db";

export type Settings = {
  onboarded: boolean;
  /** Plain-English rules for the AI judge. */
  rules: string;
  blockedKeywords: string[];
  /** Videos shorter than this are dropped (Shorts and clips). */
  minDurationMin: number;
  /** Videos longer than this are dropped (0 = no limit). */
  maxDurationMin: number;
  /** Minimum AI score (0-10) for a video to be shown. */
  threshold: number;
  dailyBudgetMin: number;
  dailyPicks: number;
  shareToken: string;
  lastRefreshAt: string | null;
};

const DEFAULTS: Settings = {
  onboarded: false,
  rules: [
    "Only show videos that teach something useful or help me improve my skills, health, mindset, career or relationships.",
    "No celebrity gossip, drama, pranks, reaction videos or clickbait.",
    "No motivational fluff without concrete, actionable advice.",
    "Prefer in-depth explanations from credible experts over hype.",
  ].join("\n"),
  blockedKeywords: ["prank", "reaction", "reacts", "drama", "gossip", "exposed", "tiktok compilation", "#shorts"],
  minDurationMin: 4,
  maxDurationMin: 0,
  threshold: 7,
  dailyBudgetMin: 45,
  dailyPicks: 10,
  shareToken: "",
  lastRefreshAt: null,
};

export function getSettings(): Settings {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const stored: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value);
    } catch {
      /* ignore corrupt value, fall back to default */
    }
  }
  const s = { ...DEFAULTS, ...stored } as Settings;
  if (!s.shareToken) {
    s.shareToken = crypto.randomBytes(12).toString("base64url");
    saveSettings({ shareToken: s.shareToken });
  }
  return s;
}

export function saveSettings(patch: Partial<Settings>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      JSON.stringify(value),
    );
  }
}

export function hasYouTubeKey() {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

export function hasAi() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function isOnboarded() {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE key = 'onboarded'");
  return row?.value === "true";
}
