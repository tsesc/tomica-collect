-- supabase/migrations/011_admin_queue_security.sql
-- Fixes the Supabase linter finding "Security Definer View" on
-- public.admin_pending_queue, plus the over-broad default grants.
--
-- 1. Views default to running with the OWNER's permissions (postgres),
--    which bypasses the querying user's RLS. security_invoker makes the
--    view enforce the caller's RLS on the underlying tables instead.
-- 2. Supabase's default public-schema grants gave anon/authenticated full
--    access to this admin-only view. Underlying tables are public-SELECT
--    today so nothing leaked, but the view exists for the review workflow —
--    only service_role (SQL Editor / admin scripts) needs it. Re-grant to
--    authenticated (gated by an is_admin() filter) if an admin dashboard UI
--    ever queries it via PostgREST.

ALTER VIEW public.admin_pending_queue SET (security_invoker = on);

REVOKE ALL ON public.admin_pending_queue FROM anon, authenticated;
