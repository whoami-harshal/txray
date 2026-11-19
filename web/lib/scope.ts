import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Showcase mode: when DEMO_PROJECT_ID is set, the dashboard shows only that project
 * (seeded sample data) to everyone, read-only, with a "Demo data" banner.
 */
export function demoProjectId(): string | null {
  const id = process.env.DEMO_PROJECT_ID?.trim();
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function isDemoMode(): boolean {
  return demoProjectId() !== null;
}

/**
 * Which projects the current viewer may see.
 * - Demo mode: just the demo project.
 * - Otherwise, development: every project (local testing).
 * - Otherwise, production: nothing (there's no login yet, so never expose real data).
 */
export async function getViewerProjectIds(): Promise<string[]> {
  const demo = demoProjectId();
  if (demo) return [demo];
  if (process.env.NODE_ENV === "production") return [];
  const { data, error } = await supabaseAdmin().from("projects").select("id").order("created_at");
  if (error) throw error;
  return (data ?? []).map((p) => p.id as string);
}
