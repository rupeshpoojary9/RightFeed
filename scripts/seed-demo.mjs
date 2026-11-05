// Fill RightFeed with a little demo data so you can explore the app before adding API keys.
// Usage: npm run seed:demo        (refuses to touch a database that already has goals)
//        npm run seed:demo -- --force   (adds the demo data anyway)
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.RIGHTFEED_DB ?? path.join(process.cwd(), "data", "rightfeed.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8"));

const hasGoals = db.prepare("SELECT COUNT(*) AS n FROM goals").get().n > 0;
if (hasGoals && !process.argv.includes("--force")) {
  console.log("Database already has goals; not seeding. Pass --force to add demo data anyway.");
  process.exit(0);
}

const setting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
setting.run("onboarded", "true");
setting.run("lastRefreshAt", JSON.stringify(new Date().toISOString()));

const addGoal = db.prepare("INSERT INTO goals (name, description, search_query, last_searched_at) VALUES (?, ?, ?, datetime('now'))");
const learning = Number(addGoal.run("Learn AI & math", "Understand how machine learning actually works", "neural networks explained").lastInsertRowid);
const mindset = Number(addGoal.run("Mindset & habits", "Beat procrastination and build grit", "habits procrastination psychology").lastInsertRowid);
const comms = Number(addGoal.run("Communication", "Speak with confidence", "public speaking confidence").lastInsertRowid);

db.prepare("INSERT OR IGNORE INTO sources (kind, ref, title, last_fetched_at) VALUES ('channel', 'UCYO_jab_esuFRV4b17AJtAw', '3Blue1Brown', datetime('now'))").run();
db.prepare("INSERT OR IGNORE INTO sources (kind, ref, title, last_fetched_at) VALUES ('channel', 'UCAuUUnT6oDeKwE6v1NGQxug', 'TED', datetime('now'))").run();

const addVideo = db.prepare(`INSERT OR IGNORE INTO videos
  (id, channel_id, channel_title, title, description, published_at, duration_sec, thumbnail, origin, origin_goal_id, status, filter_reason, score, score_reason, goal_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

const videos = [
  ["aircAruvnKk", "UCYO_jab_esuFRV4b17AJtAw", "3Blue1Brown", "But what is a neural network? | Deep learning chapter 1", "What are the neurons, why are there layers, and what is the math underlying it?", "2017-10-05T00:00:00Z", 1100, learning, 9, "A clear, visual, rigorous introduction to neural networks: exactly what your AI goal needs."],
  ["arj7oStGLkU", "UCAuUUnT6oDeKwE6v1NGQxug", "TED", "Inside the mind of a master procrastinator | Tim Urban", "Tim Urban knows that procrastination doesn't make sense, but he's never been able to shake his habit of waiting until the last minute.", "2016-04-06T00:00:00Z", 843, mindset, 8, "Funny but genuinely insightful model of procrastination you can apply today."],
  ["H14bBuluwB8", "UCAuUUnT6oDeKwE6v1NGQxug", "TED", "Grit: the power of passion and perseverance | Angela Lee Duckworth", "Angela Lee Duckworth explains her theory of grit as a predictor of success.", "2013-05-09T00:00:00Z", 368, mindset, 8, "Research-backed talk on perseverance from the leading researcher on grit."],
  ["iCvmsMzlF7o", "UCAuUUnT6oDeKwE6v1NGQxug", "TED", "The power of vulnerability | Brené Brown", "Brené Brown studies human connection: our ability to empathize, belong, love.", "2011-01-03T00:00:00Z", 1218, comms, 8, "Deep, evidence-based talk on connection that supports better relationships."],
  ["Ks-_Mh1QhMc", "UCAuUUnT6oDeKwE6v1NGQxug", "TED", "Your body language may shape who you are | Amy Cuddy", "Body language affects how others see us, but it may also change how we see ourselves.", "2012-10-01T00:00:00Z", 1262, comms, 7, "Useful for confidence before talks, though some findings are debated: watch critically."],
];
for (const [id, ch, cht, title, desc, pub, dur, goal, score, reason] of videos) {
  addVideo.run(id, ch, cht, title, desc, pub, dur, thumb(id), "channel", null, "scored", null, score, reason, goal);
}

const filtered = [
  ["demo_short_1", "Some Channel", "This one trick will CHANGE YOUR LIFE 😱 #shorts", "YouTube Short", null, null],
  ["demo_drama_1", "Drama Daily", "Influencer EXPOSED: the drama nobody is talking about", 'Blocked keyword "exposed"', null, null],
  ["demo_low_1", "Hype Central", "Millionaire morning routine (you won't believe #7)", null, 2, "Clickbait listicle with no actionable substance."],
];
for (const [id, cht, title, freason, score, sreason] of filtered) {
  addVideo.run(id, "UCdemo", cht, title, "", new Date().toISOString(), 300, null, "search", null, score == null ? "filtered" : "scored", freason, score, sreason, null);
}

console.log(`Demo data added to ${dbPath}. Start the app with: npm run dev`);
