import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PendingRow, RowUpdate, TrackerStore } from "@/lib/tracker";

export function supabaseTrackerStore(): TrackerStore {
  const db = supabaseAdmin();
  return {
    async loadPending(limit) {
      const { data, error } = await db
        .from("tx_events")
        .select("id, project_id, signature, sent_at, last_valid_block_height, cu_limit")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PendingRow[];
    },

    async saveUpdates(updates: RowUpdate[]) {
      if (updates.length === 0) return;
      const { error } = await db.from("tx_events").upsert(updates, { onConflict: "id" });
      if (error) throw error;
    },

    async cleanup(before) {
      const { count, error } = await db
        .from("tx_events")
        .delete({ count: "exact" })
        .lt("created_at", before.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  };
}
