// Trigger a feed refresh on a running RightFeed server.
// Usage: npm run refresh            (defaults to http://localhost:3000)
//        RIGHTFEED_URL=https://my.host APP_PASSWORD=... npm run refresh
// Example cron (every 6 hours):  0 */6 * * * cd /path/to/RightFeed && npm run refresh
const base = process.env.RIGHTFEED_URL ?? "http://localhost:3000";
const headers = {};
if (process.env.APP_PASSWORD) headers.Authorization = "Basic " + Buffer.from(`me:${process.env.APP_PASSWORD}`).toString("base64");

const res = await fetch(`${base}/api/refresh`, { method: "POST", headers });
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Refresh failed (${res.status}):`, body.error ?? body);
  process.exit(1);
}
console.log(`Fetched ${body.fetched} · new videos ${body.newVideos} · new articles ${body.newReadings} · filtered ${body.filtered} · judged ${body.scored}`);
for (const e of body.errors ?? []) console.warn("  !", e);
