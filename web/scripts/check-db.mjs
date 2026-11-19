// Checks that the migration ran: each table should answer "ok".
// Usage: node --env-file=.env.local scripts/check-db.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

for (const table of ["projects", "api_keys", "tx_events", "checkups"]) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  console.log(table.padEnd(10), error ? `MISSING / ERROR: ${error.message || error.code}` : `ok (${count} rows)`);
}
