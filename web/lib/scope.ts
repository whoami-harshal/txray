import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Which projects the current viewer may see.
 * TEMPORARY until Step 7 (login): in development every project is visible,
 * in production nothing is, so an early deploy can't leak data.
 */
export async function getViewerProjectIds(): Promise<string[]> {
  if (process.env.NODE_ENV === "production") return [];
  const { data, error } = await supabaseAdmin().from("projects").select("id").order("created_at");
  if (error) throw error;
  return (data ?? []).map((p) => p.id as string);
}
