import { hashApiKey, parseBearer } from "@/lib/apikey";
import { ingestSchema, toRows } from "@/lib/ingest";
import { supabaseAdmin } from "@/lib/supabase/admin";

// The SDK can run in browsers, so allow cross-origin calls. Auth is the Bearer key, not cookies.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

const MAX_BODY_BYTES = 512 * 1024;

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: CORS });
}

// Small in-memory cache so hot keys skip a DB round trip (per server instance).
const keyCache = new Map<string, { projectId: string | null; expires: number }>();
const KEY_TTL_MS = 60_000;

async function projectIdForKey(key: string): Promise<string | null> {
  const hash = hashApiKey(key);
  const cached = keyCache.get(hash);
  if (cached && cached.expires > Date.now()) return cached.projectId;

  const { data, error } = await supabaseAdmin()
    .from("api_keys")
    .select("project_id")
    .eq("key_hash", hash)
    .eq("revoked", false)
    .maybeSingle();
  if (error) throw error;

  const projectId = data?.project_id ?? null;
  if (keyCache.size > 1000) keyCache.clear();
  keyCache.set(hash, { projectId, expires: Date.now() + KEY_TTL_MS });
  return projectId;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const key = parseBearer(request.headers.get("authorization"));
  if (!key) return json({ error: "missing bearer api key" }, 401);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return json({ error: "body too large" }, 413);

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "body too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid body", issues: parsed.error.issues.slice(0, 10) }, 400);
  }

  try {
    const projectId = await projectIdForKey(key);
    if (!projectId) return json({ error: "invalid api key" }, 401);

    const rows = toRows(projectId, parsed.data.events);
    const { error } = await supabaseAdmin()
      .from("tx_events")
      .upsert(rows, { onConflict: "project_id,signature", ignoreDuplicates: true });
    if (error) throw error;

    return json({ accepted: rows.length }, 202);
  } catch (err) {
    console.error("[ingest]", err);
    return json({ error: "internal error" }, 500);
  }
}
