-- Only the service role may call the store's SECURITY DEFINER functions.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, and anon and
-- authenticated inherit from PUBLIC. Revoking from anon/authenticated alone (as
-- 20260902060000 did for sync_online_products) therefore left them callable.
-- These functions run as their owner and skip RLS, so anyone holding the
-- project's anon key (anon keys are made to be public) could call
--   POST /rest/v1/rpc/cancel_online_order   cancel any online order by id
--   POST /rest/v1/rpc/reserve_online_order  place stock holds that hide items
--   POST /rest/v1/rpc/sync_online_products  rebuild the catalogue on demand
-- The store calls them with the service role only, so nothing legitimate is lost.
-- trigger_sync_online_products is left alone: a trigger function cannot be
-- called over the API, and its EXECUTE grant is not what fires it.

DO $lock$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.cancel_online_order(uuid, text)',
    'public.reserve_online_order(uuid)',
    'public.sync_online_products()'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END
$lock$;
