import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { addDays, formatDuration, formatMinutes, weekStart } from "../lib/dates.ts";
import { fetchGenericFeed, parseIsoDuration } from "../lib/youtube.ts";
import { basicPassword, hasKeyword, isCrossSite, safeLink } from "../lib/text.ts";
import { fillLineup } from "../lib/picks.ts";
import { groupSteps, moved, parseSections, parseVideoId } from "../lib/paths.ts";
import { zstdDecompressSync } from "node:zlib";
import { chooseJudge, jevQuestions, jevReason, judgeWithJev, levelToScore } from "../lib/jev.ts";
import { JUDGE_MODEL, MODEL, clip, shuffleOptions, supportsFallbacks, verdictSchema } from "../lib/ai.ts";

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("weekStart returns the Monday of the week", () => {
  assert.equal(weekStart("2026-11-04"), "2026-11-02"); // Wednesday
  assert.equal(weekStart("2026-11-08"), "2026-11-02"); // Sunday
  assert.equal(weekStart("2026-11-02"), "2026-11-02"); // Monday
});

test("duration formatting", () => {
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(3725), "1:02:05");
  assert.equal(formatDuration(null), "");
  assert.equal(formatMinutes(45 * 60), "45 min");
  assert.equal(formatMinutes(90 * 60), "1h 30m");
});

test("parseIsoDuration handles YouTube durations", () => {
  assert.equal(parseIsoDuration("PT58S"), 58);
  assert.equal(parseIsoDuration("PT18M20S"), 1100);
  assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(parseIsoDuration("P1DT1H"), 90000);
  assert.equal(parseIsoDuration("P0D"), 0); // live streams
  assert.equal(parseIsoDuration("garbage"), null);
});

test("scoring and other AI features have their own default models", { skip: Boolean(process.env.JUDGE_MODEL || process.env.CLAUDE_MODEL) }, () => {
  assert.equal(JUDGE_MODEL, "claude-haiku-5-5");
  assert.equal(MODEL, "claude-opus-5-5");
});

test("fallbacks are only sent to models that support them", () => {
  assert.equal(supportsFallbacks("claude-opus-5-5"), true);
  assert.equal(supportsFallbacks("claude-sonnet-5-5"), true);
  assert.equal(supportsFallbacks("claude-haiku-5-5"), false);
});

test("verdict goal must be an exact goal name or null", () => {
  const schema = verdictSchema(["Communication", "Mindset & habits", "Communication"]);
  const verdict = (goal: string | null) => ({ verdicts: [{ id: "v:a", score: 8, goal, reason: "ok" }] });
  assert.equal(schema.safeParse(verdict("Mindset & habits")).success, true);
  assert.equal(schema.safeParse(verdict(null)).success, true);
  // What the model returned before: the whole "name: description" prompt line.
  assert.equal(schema.safeParse(verdict("Communication: Speak with confidence")).success, false);
  assert.equal(verdictSchema([]).safeParse(verdict(null)).success, true);
  assert.equal(verdictSchema([]).safeParse(verdict("Anything")).success, false);
});

test("shuffling quiz options keeps the answer correct and moves it around", () => {
  const q = { question: "?", options: ["right", "b", "c", "d"], answer_index: 0, explanation: "" };
  const positions = new Set<number>();
  for (let seed = 0; seed < 200; seed++) {
    const s = shuffleOptions(q);
    assert.equal(s.options[s.answer_index], "right");
    assert.deepEqual([...s.options].sort(), ["b", "c", "d", "right"]);
    positions.add(s.answer_index);
  }
  assert.equal(positions.size, 4);
  assert.equal(q.options[0], "right"); // input is left untouched
});

test("clip never leaves half an emoji, which the API rejects as invalid JSON", () => {
  const out = clip("ab😀cd", 3); // the cut lands inside the emoji
  assert.equal(out.isWellFormed(), true);
  assert.equal(JSON.stringify(out).includes("\\ud83d"), false);
  assert.equal(clip("short", 10), "short");
});

test("blocked keywords match whole words only", () => {
  assert.equal(hasKeyword("The drama nobody talks about", "drama"), true);
  assert.equal(hasKeyword("DRAMA!", "drama"), true);
  assert.equal(hasKeyword("It improved dramatically", "drama"), false);
  assert.equal(hasKeyword("melodrama", "drama"), false);
  assert.equal(hasKeyword("best bits #shorts", "#shorts"), true);
  assert.equal(hasKeyword("tiktok compilation of cats", "tiktok compilation"), true);
});

test("a dropped pick is replaced in its place by the goal with the fewest picks", () => {
  const active = [
    { id: "a1", goal_id: 1, position: 0 },
    { id: "a2", goal_id: 1, position: 1 },
    { id: "b2", goal_id: 2, position: 3 }, // position 2 was dropped
  ];
  const pool = [{ id: "a3", goal_id: 1 }, { id: "a1", goal_id: 1 }, { id: "b3", goal_id: 2 }];
  assert.deepEqual(fillLineup(active, pool, 4), [{ id: "b3", goal_id: 2, position: 2 }]);
});

test("the lineup fills evenly across goals and never repeats a video", () => {
  const pool = [{ id: "a1", goal_id: 1 }, { id: "a2", goal_id: 1 }, { id: "a3", goal_id: 1 }, { id: "b1", goal_id: 2 }, { id: "c1", goal_id: null }];
  const added = fillLineup([], pool, 4);
  assert.deepEqual(added.map((v) => v.id), ["a1", "b1", "c1", "a2"]);
  assert.deepEqual(added.map((v) => v.position), [0, 1, 2, 3]);
  assert.equal(new Set(added.map((v) => v.id)).size, 4);
});

test("a full lineup takes nothing, and a small pool just gives what it has", () => {
  const full = [{ id: "a", goal_id: 1, position: 0 }];
  assert.deepEqual(fillLineup(full, [{ id: "b", goal_id: 1 }], 1), []);
  assert.equal(fillLineup([], [{ id: "b", goal_id: 1 }], 10).length, 1);
});

async function serve(body: string) {
  const server = http.createServer((_, res) => res.end(body));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/feed`;
  return { url, close: () => server.close() };
}

test("fetchGenericFeed parses RSS with a podcast enclosure", async () => {
  const s = await serve(`<?xml version="1.0"?><rss><channel><title>Pod &amp; Co</title>
    <item><title>Ep 1</title><guid>g1</guid><link>https://x.test/1</link><description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description>
    <pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><enclosure url="https://x.test/1.mp3" type="audio/mpeg"/></item>
    <item><title>Post</title><link>https://x.test/2</link><description>Plain</description></item>
  </channel></rss>`);
  try {
    const f = await fetchGenericFeed(s.url);
    assert.equal(f.items.length, 2);
    assert.equal(f.items[0].kind, "podcast");
    assert.equal(f.items[0].summary, "Hello world");
    assert.equal(f.items[0].publishedAt, "2026-11-02T10:00:00.000Z");
    assert.equal(f.items[1].kind, "article");
    assert.equal(f.items[1].id, "https://x.test/2");
  } finally {
    s.close();
  }
});

test("fetchGenericFeed parses Atom and skips rel=self links", async () => {
  const s = await serve(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title>
    <entry><id>e1</id><title>Hi</title><link rel="self" href="https://x.test/self"/><link href="https://x.test/post"/>
    <updated>2026-11-01T00:00:00Z</updated><summary>Sum</summary></entry></feed>`);
  try {
    const f = await fetchGenericFeed(s.url);
    assert.equal(f.title, "Blog");
    assert.equal(f.items[0].link, "https://x.test/post");
  } finally {
    s.close();
  }
});

test("fetchGenericFeed rejects non-feeds", async () => {
  const s = await serve("<html><body>nope</body></html>");
  try {
    await assert.rejects(fetchGenericFeed(s.url), /Not an RSS or Atom feed/);
  } finally {
    s.close();
  }
});

test("safeLink keeps web addresses and drops script links", () => {
  assert.equal(safeLink("https://example.com/post"), "https://example.com/post");
  assert.equal(safeLink("http://example.com"), "http://example.com");
  assert.equal(safeLink("javascript:alert(1)"), "");
  assert.equal(safeLink(" JavaScript:alert(1)"), "");
  assert.equal(safeLink("data:text/html,hi"), "");
  assert.equal(safeLink("not a url"), "");
  assert.equal(safeLink(""), "");
});

test("a feed cannot plant a script link", async () => {
  const xml = `<rss><channel><title>Bad</title><item><guid>1</guid><title>Click</title><link>javascript:alert(1)</link></item></channel></rss>`;
  const server = http.createServer((_, res) => res.end(xml));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const feed = await fetchGenericFeed(`http://127.0.0.1:${port}/`);
    assert.equal(feed.items[0].link, "");
  } finally {
    server.close();
  }
});

test("isCrossSite refuses other sites and allows scripts", () => {
  assert.equal(isCrossSite(null, "localhost:3000"), false);
  assert.equal(isCrossSite("http://localhost:3000", "localhost:3000"), false);
  assert.equal(isCrossSite("https://evil.example", "localhost:3000"), true);
  assert.equal(isCrossSite("http://localhost:9999", "localhost:3000"), true);
  assert.equal(isCrossSite("null", "localhost:3000"), true);
});

test("basicPassword reads the password and survives bad headers", () => {
  assert.equal(basicPassword(`Basic ${btoa("me:s3:cret")}`), "s3:cret");
  assert.equal(basicPassword("Basic !!!not-base64"), null);
  assert.equal(basicPassword(`Basic ${btoa("nocolon")}`), null);
  assert.equal(basicPassword("Bearer abc"), null);
  assert.equal(basicPassword(""), null);
});

test("chooseJudge honours the setting and needs the matching key", () => {
  assert.equal(chooseJudge({}), null);
  assert.equal(chooseJudge({ ANTHROPIC_API_KEY: "a" }), "claude");
  assert.equal(chooseJudge({ TYPESAFE_API_KEY: "t" }), "jev");
  assert.equal(chooseJudge({ ANTHROPIC_API_KEY: "a", TYPESAFE_API_KEY: "t" }), "claude");
  assert.equal(chooseJudge({ ANTHROPIC_API_KEY: "a", TYPESAFE_API_KEY: "t", JUDGE_PROVIDER: "jev" }), "jev");
  assert.equal(chooseJudge({ ANTHROPIC_API_KEY: "a", JUDGE_PROVIDER: "jev" }), "claude");
  assert.equal(chooseJudge({ JUDGE_PROVIDER: "jev" }), null);
});

test("Jev levels map onto the 0-10 feed scale", () => {
  assert.equal(levelToScore(0), 2);
  assert.equal(levelToScore(1), 5);
  assert.equal(levelToScore(2), 8);
  assert.equal(levelToScore(3), 10);
  assert.equal(levelToScore(2.5), 9);
  assert.equal(levelToScore(-1), 2);
  assert.equal(levelToScore(9), 10);
  assert.equal(jevReason(2.2, "Health"), "Solid and useful for Health.");
  assert.equal(jevReason(0, null), "Looks like fluff.");
});

test("Jev asks only about scoring when there are no goals", () => {
  const ctx = { goals: [], rules: "", liked: [], disliked: [] };
  assert.deepEqual(Object.keys(jevQuestions(ctx)), ["value"]);
});

test("judgeWithJev turns answers into verdicts", async () => {
  const seen: { state: { video: { title: string; subscribed: boolean } }; model: string; questions: Record<string, { type: string }> }[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const body = JSON.parse((req.headers["content-encoding"] === "zstd" ? zstdDecompressSync(raw) : raw).toString());
      seen.push(body);
      const good = body.state.video.title === "Deep talk";
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        model: "jev-1.14.0",
        answers: {
          value: { type: "score", score: good ? 3 : 0.4, confidence: 0.9, probabilities: {} },
          fits: { type: "noul", noul: good ? 0.9 : 0.2 },
          goal: { type: "choice", choice: "Health", confidence: 0.8, probabilities: {} },
        },
        usage: { input_tokens: 100 },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.TYPESAFE_API_KEY = "test";
  process.env.TYPESAFE_BASE_URL = `http://127.0.0.1:${port}`;
  try {
    const base = { channel: "C", description: "x".repeat(2000), durationMin: 30, kind: "video" as const };
    const verdicts = await judgeWithJev(
      [{ ...base, id: "v:1", title: "Deep talk", subscribed: true }, { ...base, id: "v:2", title: "Prank" }],
      { goals: [{ name: "Health", description: "Strength" }, { name: "Work", description: "" }], rules: "No drama", liked: [], disliked: [] },
    );
    assert.deepEqual(verdicts, [
      { id: "v:1", score: 10, goal: "Health", reason: "Substantive and directly useful for Health." },
      { id: "v:2", score: 3, goal: null, reason: "Looks like fluff." },
    ]);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].model, "jev-latest");
    assert.deepEqual(Object.values(seen[0].questions).map((q) => q.type).sort(), ["choice", "noul", "score"]);
    assert.equal(seen.find((b) => b.state.video.title === "Deep talk")?.state.video.subscribed, true);
  } finally {
    server.close();
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_BASE_URL;
  }
});

test("parseSections reads one section per line", () => {
  assert.deepEqual(parseSections("Basics\n\n  - Core ideas\r\n2. Practice\nbasics\n"), ["Basics", "Core ideas", "Practice"]);
  assert.deepEqual(parseSections("   \n"), []);
  assert.deepEqual(parseSections("3 ways to learn"), ["3 ways to learn"]);
  assert.equal(parseSections(Array.from({ length: 50 }, (_, i) => `S${i}`).join("\n")).length, 30);
});

test("parseVideoId reads the usual link shapes and refuses others", () => {
  const id = "dQw4w9WgXcQ";
  for (const url of [id, `https://www.youtube.com/watch?v=${id}&t=30s`, `youtube.com/watch?v=${id}`, `https://youtu.be/${id}?si=abc`, `https://m.youtube.com/watch?v=${id}`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`, `https://www.youtube.com/embed/${id}`]) {
    assert.equal(parseVideoId(url), id, url);
  }
  assert.equal(parseVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseVideoId("https://www.youtube.com/@channel"), null);
  assert.equal(parseVideoId("not a link"), null);
});

test("moved swaps neighbours and stops at the ends", () => {
  assert.deepEqual(moved([1, 2, 3], 2, "up"), [2, 1, 3]);
  assert.deepEqual(moved([1, 2, 3], 2, "down"), [1, 3, 2]);
  assert.deepEqual(moved([1, 2, 3], 1, "up"), [1, 2, 3]);
  assert.deepEqual(moved([1, 2, 3], 3, "down"), [1, 2, 3]);
  assert.deepEqual(moved([1, 2, 3], 9, "up"), [1, 2, 3]);
});

test("groupSteps numbers through sections and keeps empty ones", () => {
  const sections = [{ id: 7, title: "One" }, { id: 8, title: "Two" }, { id: 9, title: "Empty" }];
  const items = [
    { id: "c", section_id: 8, position: 0 },
    { id: "a", section_id: 7, position: 5 },
    { id: "b", section_id: 7, position: 2 },
    { id: "l", section_id: null, position: 9 },
    { id: "gone", section_id: 99, position: 10 },
  ];
  const groups = groupSteps(sections, items);
  assert.deepEqual(groups.map((g) => g.section?.title ?? null), [null, "One", "Two", "Empty"]);
  assert.deepEqual(groups.flatMap((g) => g.steps.map((s) => [s.id, s.no])), [["l", 1], ["gone", 2], ["b", 3], ["a", 4], ["c", 5]]);
  assert.deepEqual(groupSteps([], []), []);
});
