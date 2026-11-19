-- TxRay: initial schema
-- Paste into the Supabase SQL editor (or run with `supabase db push`).
-- Server API routes use the service role key, which bypasses RLS.
-- RLS below only governs what a logged-in user can read with the anon key.

create extension if not exists pgcrypto;

-- ─── projects ────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists projects_user_id_idx on public.projects (user_id);

-- ─── api_keys ────────────────────────────────────────────────────────────────
create table if not exists public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  key_hash    text not null unique,          -- sha256 hex of the full key
  key_prefix  text not null,                 -- e.g. "txd_ab12" for display
  created_at  timestamptz not null default now(),
  revoked     boolean not null default false
);
create index if not exists api_keys_project_id_idx on public.api_keys (project_id);

-- ─── tx_events ───────────────────────────────────────────────────────────────
create table if not exists public.tx_events (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references public.projects(id) on delete cascade,
  signature               text not null,
  sent_at                 timestamptz not null,
  path                    text not null default 'other'
                            check (path in ('sender', 'rpc', 'other')),
  label                   text,
  cu_limit                int,
  cu_price                bigint,            -- micro-lamports per CU
  tip_lamports            bigint,
  last_valid_block_height bigint,
  status                  text not null default 'pending'
                            check (status in ('pending', 'success', 'failed', 'expired', 'unknown')),
  landed_slot             bigint,
  block_time              timestamptz,
  confirm_ms              int,
  fee_lamports            bigint,
  cu_consumed             int,
  error_category          text,
  error_raw               jsonb,
  created_at              timestamptz not null default now(),
  unique (project_id, signature)
);
create index if not exists tx_events_status_created_idx on public.tx_events (status, created_at);
create index if not exists tx_events_project_sent_idx   on public.tx_events (project_id, sent_at);

-- ─── checkups (public Free Checkup reports) ──────────────────────────────────
create table if not exists public.checkups (
  id          uuid primary key default gen_random_uuid(),
  address     text not null,
  report      jsonb not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);
create index if not exists checkups_address_created_idx on public.checkups (address, created_at desc);

-- ─── Row Level Security ──────────────────────────────────────────────────────
alter table public.projects  enable row level security;
alter table public.api_keys  enable row level security;
alter table public.tx_events enable row level security;
alter table public.checkups  enable row level security;

-- projects: owner has full access
drop policy if exists "projects_owner_all" on public.projects;
create policy "projects_owner_all" on public.projects
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- api_keys: owner can see keys of their projects (creation/revocation go through server routes)
drop policy if exists "api_keys_owner_select" on public.api_keys;
create policy "api_keys_owner_select" on public.api_keys
  for select to authenticated
  using (project_id in (select id from public.projects where user_id = (select auth.uid())));

-- tx_events: owner can read events of their projects (writes only via service role)
drop policy if exists "tx_events_owner_select" on public.tx_events;
create policy "tx_events_owner_select" on public.tx_events
  for select to authenticated
  using (project_id in (select id from public.projects where user_id = (select auth.uid())));

-- checkups: no policies → only the service role (server routes) can read/write.
