import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CheckupReport } from "@/lib/checkup/analyze";
import { newSlug } from "@/lib/checkup/slug";

export const CHECKUPS_PER_IP_PER_HOUR = 3;
export const CACHE_MS = 60 * 60_000;
export const DEFAULT_DAILY_LIMIT = 150;

export function dailyLimit(): number {
  const n = Number(process.env.CHECKUP_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_LIMIT;
}

/**
 * Site-wide cap on fresh checkups in the last 24h, so a viral day can't burn the month's
 * Helius credits. Counts the same rows the per-IP limit records.
 */
export async function underDailyLimit(): Promise<boolean> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await supabaseAdmin()
    .from("checkup_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (error) throw error;
  return (count ?? 0) < dailyLimit();
}

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

export interface CheckupSummary {
  slug: string;
  address: string;
  score: number;
  failureRate: number;
  total: number;
  kind: string;
  created_at: string;
}

const SUMMARY_COLUMNS =
  "slug, address, created_at, score:report->score, failureRate:report->failureRate, total:report->total, kind:report->>kind";

/**
 * Latest report per address. Programs only: wallets belong to people, so they're never listed
 * publicly (their share links still work for whoever has them).
 */
async function latestPerProgram(scan: number): Promise<CheckupSummary[]> {
  const { data, error } = await supabaseAdmin()
    .from("checkups")
    .select(SUMMARY_COLUMNS)
    .eq("report->>kind", "program")
    .order("created_at", { ascending: false })
    .limit(scan);
  if (error) throw error;
  const seen = new Set<string>();
  const out: CheckupSummary[] = [];
  for (const row of (data ?? []) as unknown as CheckupSummary[]) {
    if (seen.has(row.address)) continue;
    seen.add(row.address);
    out.push({ ...row, score: Number(row.score), failureRate: Number(row.failureRate), total: Number(row.total) });
  }
  return out;
}

export async function getRecentCheckups(limit = 6): Promise<CheckupSummary[]> {
  return (await latestPerProgram(100)).slice(0, limit);
}

/** Every checked program ranked by health score (ties: lower failure rate first). */
export async function getLeaderboard(limit = 100): Promise<CheckupSummary[]> {
  return (await latestPerProgram(2000))
    .sort((a, b) => b.score - a.score || a.failureRate - b.failureRate)
    .slice(0, limit);
}

/** Social proof for the landing page. */
export async function getSiteStats(): Promise<{ checkups: number; transactions: number; programs: number }> {
  const { data, error } = await supabaseAdmin()
    .from("checkups")
    .select("address, total:report->total, kind:report->>kind")
    .limit(5000);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { address: string; total: number; kind: string }[];
  return {
    checkups: rows.length,
    transactions: rows.reduce((sum, r) => sum + Number(r.total ?? 0), 0),
    programs: new Set(rows.filter((r) => r.kind === "program").map((r) => r.address)).size,
  };
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
