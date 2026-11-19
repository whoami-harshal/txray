import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ERROR_CATEGORIES, type ErrorCategory } from "@/lib/classify";

export type Range = "24h" | "7d";
export const RANGES: Range[] = ["24h", "7d"];
export const RANGE_HOURS: Record<Range, number> = { "24h": 24, "7d": 168 };

export function parseRange(v: unknown): Range {
  return v === "7d" ? "7d" : "24h";
}

export interface Totals {
  total: number;
  success: number;
  failed: number;
  expired: number;
  unknown: number;
  pending: number;
  fees_lamports: number;
  confirm_p50_ms: number | null;
  confirm_p95_ms: number | null;
  avg_cu_limit: number | null;
  avg_cu_consumed: number | null;
  p95_cu_consumed: number | null;
  success_without_cu_limit: number;
}

export interface HourPoint {
  hour: string;
  resolved: number;
  success: number;
  failed: number;
  expired: number;
  /** success / resolved, 0–100; null when nothing resolved that hour */
  rate: number | null;
}

export interface CategoryCount {
  category: ErrorCategory;
  count: number;
}

export interface LabelStats {
  label: string;
  total: number;
  success: number;
  resolved: number;
  avg_cu_limit: number | null;
  p95_cu_consumed: number | null;
}

export interface DashboardStats {
  totals: Totals;
  hourly: HourPoint[];
  categories: CategoryCount[];
  labels: LabelStats[];
  resolved: number;
}

const HOUR = 3_600_000;

/** Fill missing hours so the chart's x-axis is continuous. */
function fillHours(rows: Omit<HourPoint, "rate">[], hours: number, nowMs: number): HourPoint[] {
  const byHour = new Map(rows.map((r) => [new Date(r.hour).getTime(), r]));
  const end = Math.floor(nowMs / HOUR) * HOUR;
  const out: HourPoint[] = [];
  for (let t = end - (hours - 1) * HOUR; t <= end; t += HOUR) {
    const r = byHour.get(t);
    const resolved = Number(r?.resolved ?? 0);
    const success = Number(r?.success ?? 0);
    out.push({
      hour: new Date(t).toISOString(),
      resolved,
      success,
      failed: Number(r?.failed ?? 0),
      expired: Number(r?.expired ?? 0),
      rate: resolved > 0 ? (success / resolved) * 100 : null,
    });
  }
  return out;
}

/** Hours per chart point: hourly for 24h; 4-hour buckets for 7d so low traffic isn't all noise. */
export const BUCKET_HOURS: Record<Range, number> = { "24h": 1, "7d": 4 };

/** Merge consecutive hourly points into buckets aligned to UTC multiples of `size` hours. */
export function bucketHours(points: HourPoint[], size: number): HourPoint[] {
  if (size <= 1) return points;
  const buckets = new Map<number, HourPoint>();
  for (const p of points) {
    const key = Math.floor(new Date(p.hour).getTime() / (size * HOUR)) * size * HOUR;
    const b = buckets.get(key) ?? { hour: new Date(key).toISOString(), resolved: 0, success: 0, failed: 0, expired: 0, rate: null };
    b.resolved += p.resolved;
    b.success += p.success;
    b.failed += p.failed;
    b.expired += p.expired;
    b.rate = b.resolved > 0 ? (b.success / b.resolved) * 100 : null;
    buckets.set(key, b);
  }
  return [...buckets.values()];
}

export async function getDashboardStats(projectIds: string[], range: Range, nowMs = Date.now()): Promise<DashboardStats> {
  const hours = RANGE_HOURS[range];
  const since = new Date(Math.floor(nowMs / HOUR) * HOUR - (hours - 1) * HOUR).toISOString();
  const { data, error } = await supabaseAdmin().rpc("dashboard_stats", {
    p_project_ids: projectIds,
    p_since: since,
  });
  if (error) throw error;

  const raw = data as {
    totals: Totals;
    hourly: Omit<HourPoint, "rate">[];
    categories: CategoryCount[];
    labels: LabelStats[];
  };
  const t = raw.totals;
  const totals: Totals = {
    ...t,
    total: Number(t.total),
    success: Number(t.success),
    failed: Number(t.failed),
    expired: Number(t.expired),
    unknown: Number(t.unknown),
    pending: Number(t.pending),
    fees_lamports: Number(t.fees_lamports),
    success_without_cu_limit: Number(t.success_without_cu_limit),
  };
  return {
    totals,
    hourly: bucketHours(fillHours(raw.hourly, hours, nowMs), BUCKET_HOURS[range]),
    categories: raw.categories
      .map((c) => ({
        category: (ERROR_CATEGORIES as readonly string[]).includes(c.category) ? c.category : "UNKNOWN",
        count: Number(c.count),
      })),
    labels: raw.labels.map((l) => ({ ...l, total: Number(l.total), success: Number(l.success), resolved: Number(l.resolved) })),
    resolved: totals.success + totals.failed + totals.expired + totals.unknown,
  };
}

export const STATUSES = ["pending", "success", "failed", "expired", "unknown"] as const;
export type TxStatus = (typeof STATUSES)[number];

export interface TxFilters {
  status?: TxStatus;
  category?: ErrorCategory;
  label?: string;
  page: number;
}

export interface TxRow {
  id: string;
  signature: string;
  sent_at: string;
  label: string | null;
  path: string;
  status: TxStatus;
  confirm_ms: number | null;
  fee_lamports: number | null;
  cu_limit: number | null;
  cu_consumed: number | null;
  error_category: ErrorCategory | null;
}

export const PAGE_SIZE = 50;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseTxFilters(sp: Record<string, string | string[] | undefined>): TxFilters {
  const status = one(sp.status);
  const category = one(sp.category);
  const label = one(sp.label);
  const page = Math.max(1, Math.min(1000, Number(one(sp.page)) || 1));
  return {
    status: (STATUSES as readonly string[]).includes(status ?? "") ? (status as TxStatus) : undefined,
    category: (ERROR_CATEGORIES as readonly string[]).includes(category ?? "") ? (category as ErrorCategory) : undefined,
    label: label ? label.slice(0, 100) : undefined,
    page,
  };
}

export async function getTransactions(projectIds: string[], f: TxFilters) {
  let q = supabaseAdmin()
    .from("tx_events")
    .select("id, signature, sent_at, label, path, status, confirm_ms, fee_lamports, cu_limit, cu_consumed, error_category", {
      count: "estimated",
    })
    .in("project_id", projectIds)
    .order("sent_at", { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.status) q = q.eq("status", f.status);
  if (f.category) q = q.eq("error_category", f.category);
  if (f.label) q = q.eq("label", f.label);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as TxRow[], count: count ?? 0 };
}

export async function getLabels(projectIds: string[]): Promise<string[]> {
  const { data, error } = await supabaseAdmin().rpc("dashboard_labels", { p_project_ids: projectIds });
  if (error) throw error;
  return (data ?? []) as string[];
}
