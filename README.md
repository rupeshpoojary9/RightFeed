# MyTube

A calm, growth-focused video feed. Instead of YouTube's endless recommendations, you get a **small set of videos each day, picked for your goals**. Shorts, clickbait and drama are filtered out, and everything is built to help you learn and *act*, not just watch.

## What it does

**Only what helps you grow**
- **Your goals drive everything.** Add 3–5 goals (e.g. "Personal finance", "Learn system design"). Every video has to serve one of them.
- **Sources you choose:** channels you trust (via their free RSS feeds), plus a daily YouTube search for each goal (with a YouTube API key). Blogs, newsletters and podcasts can be added via RSS too.
- **Hard rules first:** Shorts, videos under a minimum length, blocked keywords ("prank", "drama", …) and blocked channels are dropped before anything else.
- **AI judge:** Claude scores each remaining video 0–10 against your goals and *your own plain-English rules*, with a one-line reason. Only videos above your threshold get through.
- **Taste tuning:** 👍/👎 ratings are fed back to the judge so it learns what you find valuable.
- **Transparency:** Library → *Filtered out* shows what was dropped and why. You can rescue anything the judge got wrong.

**Watch on purpose**
- **Daily picks:** a fixed number of videos per day, balanced across goals. When they're done, you're done ("You're done for today 🎉").
- **Intent check:** before a video plays you write down *why* you're watching it.
- **Daily time budget:** real playing time is tracked; the player locks when your budget is used up.
- **Distraction-free player:** YouTube's privacy-enhanced embed, with no recommendations sidebar, comments or autoplay rabbit hole.
- **Watch later** queue and **history** (including the intents you wrote).

**Learn more from each video**
- **AI summary** with key points, generated from the transcript when available, so you can decide whether the full video is worth your time.
- **Timestamped notes:** click a note to jump back to that moment.
- **Quiz:** 3 active-recall questions after watching.
- **Flashcards with spaced repetition** (SM-2), made from the video by AI or written by you. The Review page shows what's due today.
- **Action step:** "What's one thing you'll do with this?", with AI suggestions. Action steps appear on Today and Progress until done.
- **Learning paths:** the AI orders the best videos for a goal into a short course from basics to advanced, and tracks your progress.

**Track your growth**
- **Progress dashboard:** streak, time per goal, last 14 days, videos finished, quiz accuracy, actions done.
- **Weekly reflection:** an AI summary of what you learned, what you applied, patterns, and suggestions for next week.
- **Search** across your notes, transcripts and summaries, and jump to the exact moment in the video.
- **Accountability buddy:** a private share link showing your goals, streak and completed actions, but not your notes.

## Quick start

Requirements: **Node.js 22.13 or newer**.

```bash
npm install
cp .env.example .env.local      # then fill in your keys (see below)
npm run dev                     # open http://localhost:3000
```

The first time you open it, a short setup asks for your goals and the channels you trust.

Want to look around before setting anything up? Run `npm run seed:demo` first to load a few sample videos.

### API keys (both optional, both recommended)

| Key | What it unlocks | Cost |
| --- | --- | --- |
| `YOUTUBE_API_KEY` | Daily search for each goal; reliable Shorts detection (via video length) | Free. 10,000 units a day; MyTube uses ~200 per goal per day |
| `ANTHROPIC_API_KEY` | AI judge, summaries, quizzes, flashcards, learning paths, weekly reflection | Pay per use |

- **YouTube:** [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com), enable *YouTube Data API v3*, then go to *Credentials* → *Create API key*.
- **Anthropic:** [console.anthropic.com](https://console.anthropic.com).

Without an Anthropic key, MyTube falls back to simple keyword scoring (trusted channels + goal keyword matches) and the AI features are hidden.

The AI model defaults to `claude-opus-5-5`. Set `CLAUDE_MODEL=claude-haiku-5-5` in `.env.local` if you want the cheapest option. Video scoring is batched (12 videos per request) at low effort to keep costs down. Requests use server-side refusal fallbacks (`fallbacks: "default"`), so if a model declines a request it's retried on a suitable fallback model automatically.

## Keeping the feed fresh

The feed refreshes automatically when you open the app and the last refresh is more than 6 hours old. You can also press **Refresh feed**, or schedule it:

```bash
# every 6 hours, while the server is running
0 */6 * * * cd /path/to/MyTube && npm run refresh
```

`npm run refresh` calls `POST /api/refresh` on `MYTUBE_URL` (default `http://localhost:3000`).

## Hosting it online

Run `npm run build && npm start` on any Node host with a persistent disk. All data lives in a single SQLite file at `data/mytube.db` (set `MYTUBE_DB` to change it), so back it up like any other file.

If the app is reachable from the internet, **set `APP_PASSWORD`**. Every page then asks for that password (HTTP Basic auth, any username), except the read-only buddy page at `/share/<token>`.

## How it's built

- **Next.js 16** (App Router, server actions) + **React 19**, plain CSS with automatic light/dark mode.
- **SQLite** via Node's built-in `node:sqlite`, so there are no native dependencies. Node prints an "SQLite is experimental" warning on startup; it's harmless.
- **Anthropic TypeScript SDK** with structured outputs (Zod schemas) for every AI feature.

```
app/            pages + server actions (app/actions.ts)
components/     UI components (WatchClient.tsx is the player + tabs)
lib/db.ts       SQLite connection and helpers; schema in lib/schema.sql
lib/youtube.ts  RSS feeds, YouTube Data API, transcripts, generic RSS/Atom
lib/ingest.ts   refresh pipeline: fetch, then hard rules, then judge, then daily picks, plus time budget
lib/ai.ts       all Claude calls (judge, summary, quiz, flashcards, paths, reflection)
lib/learn.ts    summaries/quizzes caching, spaced repetition, stats, weekly reflection
scripts/        refresh trigger and demo data seeder
```

### Notes and limits
- Videos play in YouTube's embedded player, as YouTube's terms require, so ads may still appear.
- Transcripts are fetched best-effort from YouTube's public player endpoint. When unavailable, summaries and quizzes fall back to the description (the UI says so).
- Channel RSS feeds include only each channel's ~15 latest uploads.
