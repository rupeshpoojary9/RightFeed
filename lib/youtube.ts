import "server-only";
import { XMLParser } from "fast-xml-parser";
import { safeLink } from "./text.ts";

const API = "https://www.googleapis.com/youtube/v3";
const UA = "Mozilla/5.0 (compatible; RightFeed/0.1; personal feed reader)";

export type FeedVideo = {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  publishedAt: string | null;
  thumbnail: string | null;
  isShort: boolean;
  durationSec: number | null;
};

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"]);
  }
  return "";
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, "Accept-Language": "en", ...(init?.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error(`Couldn't reach ${new URL(url).host}. Check your internet connection.`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.replace(/key=[^&]+/, "key=***")}`);
  return res.text();
}

async function api<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set");
  const qs = new URLSearchParams({ ...params, key });
  const body = await fetchText(`${API}/${endpoint}?${qs}`);
  return JSON.parse(body) as T;
}

/** Latest ~15 uploads of a channel via its free public RSS feed (no API key or quota). */
export async function fetchChannelFeed(channelId: string): Promise<{ title: string; videos: FeedVideo[] }> {
  const body = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
  const doc = xml.parse(body);
  const feed = doc.feed ?? {};
  const channelTitle = text(feed.title) || text(feed.author?.name);
  const videos = asArray(feed.entry).map((e: Record<string, any>): FeedVideo => {
    const group = e["media:group"] ?? {};
    const link = asArray(e.link)[0]?.["@_href"] ?? "";
    return {
      id: text(e["yt:videoId"]),
      channelId: text(e["yt:channelId"]) || channelId,
      channelTitle: text(e.author?.name) || channelTitle,
      title: text(e.title),
      description: text(group["media:description"]),
      publishedAt: text(e.published) || null,
      thumbnail: group["media:thumbnail"]?.["@_url"] ?? null,
      isShort: String(link).includes("/shorts/"),
      durationSec: null,
    };
  });
  return { title: channelTitle, videos: videos.filter((v) => v.id) };
}

/**
 * A channel's long-form uploads. RSS only lists the latest ~15 uploads of any kind, so a
 * channel that posts mostly Shorts shows almost nothing else. With an API key we read the
 * channel's long-videos playlist (UULF + the id without "UC"; 1 quota unit) and fall back
 * to RSS if it isn't available.
 */
export async function fetchChannelUploads(channelId: string): Promise<{ title: string; videos: FeedVideo[] }> {
  if (!process.env.YOUTUBE_API_KEY) return fetchChannelFeed(channelId);
  type Items = {
    items?: {
      snippet: {
        title: string;
        description: string;
        publishedAt: string;
        channelTitle: string;
        videoOwnerChannelId?: string;
        resourceId: { videoId: string };
        thumbnails?: { high?: { url: string }; medium?: { url: string } };
      };
    }[];
  };
  try {
    const r = await api<Items>("playlistItems", { part: "snippet", maxResults: "20", playlistId: `UULF${channelId.slice(2)}` });
    const videos = (r.items ?? [])
      .filter((i) => i.snippet.title !== "Private video" && i.snippet.title !== "Deleted video")
      .map((i): FeedVideo => ({
        id: i.snippet.resourceId.videoId,
        channelId: i.snippet.videoOwnerChannelId ?? channelId,
        channelTitle: i.snippet.channelTitle,
        title: i.snippet.title,
        description: i.snippet.description,
        publishedAt: i.snippet.publishedAt,
        thumbnail: i.snippet.thumbnails?.high?.url ?? i.snippet.thumbnails?.medium?.url ?? null,
        isShort: false,
        durationSec: null,
      }));
    if (videos.length) return { title: videos[0].channelTitle, videos };
  } catch {
    /* fall back to RSS below */
  }
  return fetchChannelFeed(channelId);
}

/**
 * Turn whatever the user pasted (channel URL, @handle, or UC… id) into a channel id.
 */
export async function resolveChannel(input: string): Promise<{ id: string; title: string }> {
  const raw = input.trim();
  const idMatch = raw.match(/(UC[\w-]{22})/);
  if (idMatch) {
    const { title } = await fetchChannelFeed(idMatch[1]).catch(() => ({ title: "" }));
    return { id: idMatch[1], title };
  }
  const handleMatch = raw.match(/@([\w.\-]+)/);
  const handle = handleMatch ? handleMatch[1] : raw.replace(/^https?:\/\/(www\.)?youtube\.com\//, "").replace(/\/.*$/, "");
  if (!handle) throw new Error("Could not understand that channel");

  if (process.env.YOUTUBE_API_KEY) {
    const r = await api<{ items?: { id: string; snippet: { title: string } }[] }>("channels", {
      part: "snippet",
      forHandle: `@${handle}`,
    });
    const item = r.items?.[0];
    if (item) return { id: item.id, title: item.snippet.title };
  }

  // No key (or not found): read the channel page and pull its id out of the HTML.
  const url = /^https?:\/\//.test(raw) ? raw : `https://www.youtube.com/@${handle}`;
  const html = await fetchText(url);
  const m =
    html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/) ??
    html.match(/"externalId":"(UC[\w-]{22})"/) ??
    html.match(/"channelId":"(UC[\w-]{22})"/);
  if (!m) throw new Error(`Couldn't find a channel id at ${url}`);
  const t = html.match(/<meta property="og:title" content="([^"]+)"/);
  return { id: m[1], title: t ? decodeEntities(t[1]) : handle };
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Search YouTube for a goal. Costs 100 of the 10,000 daily API quota units. */
export async function searchVideos(query: string, maxResults = 15): Promise<FeedVideo[]> {
  const publishedAfter = new Date(Date.now() - 3 * 365 * 86400000).toISOString();
  // With a region set, results follow what's relevant there (including Hindi); otherwise lean English.
  const region = process.env.YOUTUBE_REGION;
  const locale: Record<string, string> = region ? { regionCode: region } : { relevanceLanguage: "en" };
  type SearchResp = {
    items?: {
      id: { videoId?: string };
      snippet: {
        channelId: string;
        channelTitle: string;
        title: string;
        description: string;
        publishedAt: string;
        thumbnails?: { high?: { url: string }; medium?: { url: string } };
      };
    }[];
  };
  const r = await api<SearchResp>("search", {
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(maxResults),
    videoDuration: "medium", // 4-20 minutes; long videos come from channels you trust
    ...locale,
    safeSearch: "moderate",
    order: "relevance",
    publishedAfter,
  });
  const long = await api<SearchResp>("search", {
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "5",
    videoDuration: "long",
    ...locale,
    order: "relevance",
    publishedAfter,
  }).catch(() => ({ items: [] }) as SearchResp);
  return [...(r.items ?? []), ...(long.items ?? [])]
    .filter((i) => i.id.videoId)
    .map((i) => ({
      id: i.id.videoId!,
      channelId: i.snippet.channelId,
      channelTitle: decodeEntities(i.snippet.channelTitle),
      title: decodeEntities(i.snippet.title),
      description: decodeEntities(i.snippet.description),
      publishedAt: i.snippet.publishedAt,
      thumbnail: i.snippet.thumbnails?.high?.url ?? i.snippet.thumbnails?.medium?.url ?? null,
      isShort: false,
      durationSec: null,
    }));
}

/** ISO 8601 duration (PT1H2M3S) to seconds. */
export function parseIsoDuration(iso: string): number | null {
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** Durations + full descriptions for up to 50 ids per call (1 quota unit per call). */
export async function fetchVideoDetails(ids: string[]): Promise<Map<string, { durationSec: number | null; description: string }>> {
  const out = new Map<string, { durationSec: number | null; description: string }>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const r = await api<{
      items?: { id: string; contentDetails: { duration: string }; snippet: { description: string } }[];
    }>("videos", { part: "contentDetails,snippet", id: batch.join(",") });
    for (const item of r.items ?? []) {
      out.set(item.id, {
        durationSec: parseIsoDuration(item.contentDetails.duration),
        description: item.snippet.description,
      });
    }
  }
  return out;
}

/** One video by id, for adding it to a path by hand. */
export async function fetchVideo(id: string): Promise<FeedVideo | null> {
  const r = await api<{
    items?: {
      id: string;
      contentDetails: { duration: string };
      snippet: { title: string; description: string; channelId: string; channelTitle: string; publishedAt: string; thumbnails?: { high?: { url: string } } };
    }[];
  }>("videos", { part: "contentDetails,snippet", id });
  const item = r.items?.[0];
  if (!item) return null;
  return {
    id: item.id,
    channelId: item.snippet.channelId,
    channelTitle: item.snippet.channelTitle,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    thumbnail: item.snippet.thumbnails?.high?.url ?? null,
    isShort: false,
    durationSec: parseIsoDuration(item.contentDetails.duration),
  };
}

/**
 * Best-effort transcript fetch using YouTube's public player endpoint.
 * YouTube changes this regularly; callers must handle failure gracefully.
 */
export async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const playerRes = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        videoId,
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en" } },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!playerRes.ok) return null;
    const player = (await playerRes.json()) as {
      captions?: {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: { baseUrl: string; languageCode: string; kind?: string }[];
        };
      };
    };
    const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    if (!tracks.length) return null;
    const track =
      tracks.find((t) => t.languageCode.startsWith("en") && t.kind !== "asr") ??
      tracks.find((t) => t.languageCode.startsWith("en")) ??
      tracks[0];
    const body = await fetchText(track.baseUrl.replace(/&fmt=[^&]+/, ""));
    const doc = xml.parse(body);
    // Two formats exist: <transcript><text start=..> and <timedtext><body><p t=..>
    const lines: string[] = [];
    for (const t of asArray(doc.transcript?.text)) {
      const start = Number(t?.["@_start"] ?? 0);
      lines.push(`[${Math.floor(start)}] ${decodeEntities(text(t))}`);
    }
    for (const p of asArray(doc.timedtext?.body?.p)) {
      const start = Number(p?.["@_t"] ?? 0) / 1000;
      const words = text(p) || asArray(p?.s).map(text).join("");
      if (words.trim()) lines.push(`[${Math.floor(start)}] ${decodeEntities(words)}`);
    }
    const joined = lines.join("\n").trim();
    return joined || null;
  } catch {
    return null;
  }
}

/* ---------------- Generic RSS / Atom (articles and podcasts) ---------------- */

export type FeedItem = {
  id: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
  kind: "article" | "podcast";
};

export async function fetchGenericFeed(url: string): Promise<{ title: string; items: FeedItem[] }> {
  const body = await fetchText(url);
  const doc = xml.parse(body);
  const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
  if (doc.rss?.channel) {
    const ch = doc.rss.channel;
    return {
      title: text(ch.title),
      items: asArray(ch.item).map((it: Record<string, any>) => {
        const link = safeLink(text(it.link) || it.enclosure?.["@_url"] || "");
        return {
          id: text(it.guid) || link || text(it.title),
          title: decodeEntities(text(it.title)),
          link,
          summary: decodeEntities(strip(text(it.description) || text(it["content:encoded"]) || text(it["itunes:summary"]))),
          publishedAt: text(it.pubDate) ? new Date(text(it.pubDate)).toISOString() : null,
          kind: it.enclosure?.["@_type"]?.startsWith("audio") ? "podcast" : "article",
        };
      }),
    };
  }
  if (doc.feed) {
    const f = doc.feed;
    return {
      title: text(f.title),
      items: asArray(f.entry).map((e: Record<string, any>) => {
        const links = asArray(e.link);
        const link = safeLink((links.find((l: any) => l?.["@_rel"] !== "self") ?? links[0])?.["@_href"] ?? "");
        return {
          id: text(e.id) || link,
          title: decodeEntities(text(e.title)),
          link,
          summary: decodeEntities(strip(text(e.summary) || text(e.content))),
          publishedAt: text(e.published) || text(e.updated) || null,
          kind: "article" as const,
        };
      }),
    };
  }
  throw new Error("Not an RSS or Atom feed");
}
