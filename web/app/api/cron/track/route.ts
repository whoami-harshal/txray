import { timingSafeEqual } from "node:crypto";
import { createRpc } from "@/lib/solana/rpc";
import { runTracker } from "@/lib/tracker";
import { supabaseTrackerStore } from "@/lib/tracker-store";

// Vercel Hobby allows up to 60s; the tracker stops starting new work at ~45s.
export const maxDuration = 60;

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Accepts ?secret=CRON_SECRET (cron-job.org) or Authorization: Bearer CRON_SECRET (Vercel Cron). */
function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const fromQuery = new URL(request.url).searchParams.get("secret");
  const fromHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return [fromQuery, fromHeader].some((s) => !!s && safeEqual(s, expected));
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rpcUrl = process.env.HELIUS_RPC_URL;
  if (!rpcUrl) return Response.json({ error: "HELIUS_RPC_URL is not set" }, { status: 500 });

  try {
    const summary = await runTracker({ store: supabaseTrackerStore(), rpc: createRpc({ url: rpcUrl }) });
    console.log("[cron/track]", JSON.stringify(summary));
    return Response.json(summary);
  } catch (err) {
    console.error("[cron/track]", err);
    return Response.json({ error: "tracker failed" }, { status: 500 });
  }
}
