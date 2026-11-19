-- Table privileges for the Supabase API roles.
-- Needed when the project was created with "automatically expose new tables" turned off:
-- without these, even the service role gets "permission denied for table ...".
-- RLS policies (001_init.sql) still decide which ROWS a logged-in user can see.

-- Server routes (service role / secret key): full access
grant select, insert, update, delete on public.projects  to service_role;
grant select, insert, update, delete on public.api_keys  to service_role;
grant select, insert, update, delete on public.tx_events to service_role;
grant select, insert, update, delete on public.checkups  to service_role;

-- Logged-in users (publishable key + session): limited by RLS policies
grant select, insert, update, delete on public.projects  to authenticated;
grant select                         on public.api_keys  to authenticated;
grant select                         on public.tx_events to authenticated;

-- anon gets nothing: public pages read through server routes.
