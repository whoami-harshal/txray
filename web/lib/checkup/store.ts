import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CheckupReport } from "@/lib/checkup/analyze";
import { newSlug } from "@/lib/checkup/slug";

export const CHECKUPS_PER_IP_PER_HOUR = 3;
export const CACHE_MS = 60 * 60_000;


/** Salted hash so the DB never holds raw IPs. */
export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(`${process.env.CRON_SECRET ?? "txdoctor"}:${ip}`)
    .digest("hex");
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** A report for this address made within the cache window, if any. */
export async function findCached(address: string): Promise<{ slug: string } | null> {
  const since = new Date(Date.now() - CACHE_MS).toISOString();
  const { data, error } = await supabaseAdmin()
    .from("checkups")
    .select("slug")
    .eq("address", address)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { slug: data.slug as string } : null;
}

/** Records the request and returns false when this IP is over the limit. */
export async function takeRateLimit(ipHash: string): Promise<{ ok: boolean; retryAfterSec: number }> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data, error } = await db
    .from("checkup_requests")
    .select("created_at")
    .eq("ip_hash", ipHash)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) throw error;

  if ((data?.length ?? 0) >= CHECKUPS_PER_IP_PER_HOUR) {
    const oldest = Date.parse(data![0]!.created_at as string);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + 60 * 60_000 - Date.now()) / 1000)) };
  }

  const { error: insErr } = await db.from("checkup_requests").insert({ ip_hash: ipHash });
  if (insErr) throw insErr;
  // Housekeeping: drop rows nobody needs any more.
  await db.from("checkup_requests").delete().lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  return { ok: true, retryAfterSec: 0 };
}

export async function saveCheckup(report: CheckupReport): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = newSlug();
    const { error } = await supabaseAdmin().from("checkups").insert({ address: report.address, report, slug });
    if (!error) return slug;
    if (error.code !== "23505") throw error; // retry only on slug collision
  }
  throw new Error("could not allocate a slug");
}

export async function getCheckup(slug: string): Promise<{ report: CheckupReport; created_at: string } | null> {
  if (!/^[A-Za-z0-9]{6,20}$/.test(slug)) return null;
  const { data, error } = await supabaseAdmin()
    .from("checkups")
    .select("report, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as { report: CheckupReport; created_at: string } | null;
}
