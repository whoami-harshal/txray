// Creates a dev user + project + API key so you can test /api/ingest with curl.
// Usage: node --env-file=.env.local scripts/create-dev-key.mjs [email]
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const email = process.argv[2] ?? "dev@txdoctor.local";
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

// Find or create the user
let userId;
const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) throw listErr;
userId = list.users.find((u) => u.email === email)?.id;
if (!userId) {
  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
}

const { data: project, error: pErr } = await sb
  .from("projects")
  .insert({ user_id: userId, name: "Dev project" })
  .select("id")
  .single();
if (pErr) throw pErr;

const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
let key = "txd_";
while (key.length < 36) {
  const b = randomBytes(1)[0];
  if (b < 248) key += alphabet[b % 62];
}
const { error: kErr } = await sb.from("api_keys").insert({
  project_id: project.id,
  key_hash: createHash("sha256").update(key).digest("hex"),
  key_prefix: key.slice(0, 8),
});
if (kErr) throw kErr;

console.log(`user:    ${email} (${userId})`);
console.log(`project: ${project.id}`);
console.log(`api key: ${key}   <- shown once, save it`);
