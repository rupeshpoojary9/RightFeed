import { NextResponse } from "next/server";
import { refresh } from "@/lib/ingest";
import { isCrossSite } from "@/lib/text";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/refresh: fetch and judge new content. Used by `npm run refresh` / cron. */
export async function POST(request: Request) {
  const { headers } = request;
  if (isCrossSite(headers.get("origin"), headers.get("x-forwarded-host") ?? headers.get("host"))) {
    return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  }
  try {
    const report = await refresh({ force: false });
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
