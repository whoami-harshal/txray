-- Dashboard aggregations done in Postgres, so the app never pulls thousands of rows.
-- Paste into the Supabase SQL editor after 001 and 002.
-- security invoker: with the service role it sees everything it's asked for; with a
-- logged-in user's session, RLS still limits rows to their own projects.

create or replace function public.dashboard_stats(p_project_ids uuid[], p_since timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    select *
    from tx_events
    where project_id = any (p_project_ids)
      and sent_at >= p_since
  ),
  totals as (
    select
      count(*)                                         as total,
      count(*) filter (where status = 'success')       as success,
      count(*) filter (where status = 'failed')        as failed,
      count(*) filter (where status = 'expired')       as expired,
      count(*) filter (where status = 'unknown')       as unknown,
      count(*) filter (where status = 'pending')       as pending,
      coalesce(sum(fee_lamports), 0)                   as fees_lamports,
      percentile_cont(0.5)  within group (order by confirm_ms)
        filter (where status = 'success' and confirm_ms is not null) as confirm_p50_ms,
      percentile_cont(0.95) within group (order by confirm_ms)
        filter (where status = 'success' and confirm_ms is not null) as confirm_p95_ms,
      avg(cu_limit)    filter (where status = 'success' and cu_limit is not null and cu_consumed is not null) as avg_cu_limit,
      avg(cu_consumed) filter (where status = 'success' and cu_limit is not null and cu_consumed is not null) as avg_cu_consumed,
      percentile_cont(0.95) within group (order by cu_consumed)
        filter (where status = 'success' and cu_consumed is not null) as p95_cu_consumed,
      count(*) filter (where status = 'success' and cu_limit is null) as success_without_cu_limit
    from ev
  ),
  hourly as (
    select
      date_trunc('hour', sent_at)                    as hour,
      count(*) filter (where status <> 'pending')    as resolved,
      count(*) filter (where status = 'success')     as success,
      count(*) filter (where status = 'failed')      as failed,
      count(*) filter (where status = 'expired')     as expired
    from ev
    group by 1
    order by 1
  ),
  categories as (
    select coalesce(error_category, 'UNKNOWN') as category, count(*) as count
    from ev
    where status in ('failed', 'expired', 'unknown')
    group by 1
    order by 2 desc
  ),
  labels as (
    select
      coalesce(label, '(no label)')                  as label,
      count(*)                                       as total,
      count(*) filter (where status = 'success')     as success,
      count(*) filter (where status <> 'pending')    as resolved,
      avg(cu_limit)    filter (where status = 'success' and cu_limit is not null) as avg_cu_limit,
      percentile_cont(0.95) within group (order by cu_consumed)
        filter (where status = 'success' and cu_consumed is not null) as p95_cu_consumed
    from ev
    group by 1
    order by 2 desc
    limit 10
  )
  select jsonb_build_object(
    'totals',     (select to_jsonb(totals) from totals),
    'hourly',     coalesce((select jsonb_agg(to_jsonb(hourly)) from hourly), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(categories)) from categories), '[]'::jsonb),
    'labels',     coalesce((select jsonb_agg(to_jsonb(labels)) from labels), '[]'::jsonb)
  );
$$;

create or replace function public.dashboard_labels(p_project_ids uuid[])
returns setof text
language sql
stable
security invoker
set search_path = public
as $$
  select distinct label
  from tx_events
  where project_id = any (p_project_ids) and label is not null
  order by label
  limit 200;
$$;

revoke all on function public.dashboard_stats(uuid[], timestamptz) from public, anon;
revoke all on function public.dashboard_labels(uuid[]) from public, anon;
grant execute on function public.dashboard_stats(uuid[], timestamptz) to service_role, authenticated;
grant execute on function public.dashboard_labels(uuid[]) to service_role, authenticated;
