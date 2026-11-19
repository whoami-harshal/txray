-- Free Checkup: per-IP rate limiting (3 fresh checkups per IP per hour).
-- Stores only a salted hash of the IP, never the IP itself. Rows older than a day are deleted by the app.

create table if not exists public.checkup_requests (
  id          bigint generated always as identity primary key,
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists checkup_requests_ip_created_idx on public.checkup_requests (ip_hash, created_at desc);

alter table public.checkup_requests enable row level security;
-- no policies: only the service role (server routes) can read/write

grant select, insert, delete on public.checkup_requests to service_role;
