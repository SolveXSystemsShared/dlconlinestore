-- CDASH owns stock and money.
--
-- The store may READ the shared database freely — catalogue, inventory levels,
-- members, prices. It must never WRITE exchanges, exchange line items,
-- inventory_items, member_points_*, member_buy_ten_*, lounge_*, or
-- instore_credits. Every one of those writes belongs to CDASH, because a write
-- that skips POST /api/exchanges skips the §7 waterfall: promo-or-normal price,
-- ONE discount (card XOR cash), DLC Credit redemption under the 20% basket cap,
-- banded points on the net actually paid, Buy-10 progress on paid units, then
-- the behaviour bonuses.
--
-- online_orders and online_order_items stay ours. They are the DELIVERY record
-- — address, phone, notes, tracking — plus a reference to the CDASH exchange.
-- They are no longer the source of truth for money.

-- ---------------------------------------------------------------------------
-- 1. finalize_online_order has to go.
--
-- It inserted straight into public.exchanges at the UNDISCOUNTED subtotal,
-- stamped 'paid', and decremented inventory_items itself — so it both bypassed
-- the programme and would double-decrement stock against the CDASH path.
--
-- It has never fired: as of 2026-09-10 online_orders held 0 rows and no
-- exchange carried staff_member = 'Online Store'. There is nothing to unwind.
-- It is SECURITY DEFINER, so revoking table grants would not have contained it;
-- dropping it is the only thing that does.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.finalize_online_order(uuid, text, jsonb);

-- ---------------------------------------------------------------------------
-- 2. Which store fulfils online orders.
--
-- This was DEFAULT_STORE_ID, an environment variable, which meant changing it
-- was a redeploy and directors could not do it at all. It lives in the database
-- now so a director can move online fulfilment between stores from a dashboard
-- control, and so both apps read the same answer.
--
-- Singleton: one row, id fixed to true, so "the setting" is never ambiguous.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_store_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NULL
);

-- stores.id is text (Prisma wrote `id TEXT DEFAULT gen_random_uuid()`) while
-- exchanges.id is a real uuid, so the column copies the type of the column it
-- points at rather than assuming either one.
DO $link$
DECLARE v_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'stores'
    AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'CDASH table public.stores is missing — apply this migration to the CDASH Supabase project';
  END IF;

  EXECUTE format('ALTER TABLE public.online_store_settings ADD COLUMN IF NOT EXISTS fulfillment_store_id %s NULL', v_type);

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'online_store_settings_fulfillment_store_id_fkey') THEN
    ALTER TABLE public.online_store_settings
      ADD CONSTRAINT online_store_settings_fulfillment_store_id_fkey
      FOREIGN KEY (fulfillment_store_id) REFERENCES public.stores(id);
  END IF;
END
$link$;

DROP TRIGGER IF EXISTS trg_online_store_settings_updated_at ON public.online_store_settings;
CREATE TRIGGER trg_online_store_settings_updated_at
  BEFORE UPDATE ON public.online_store_settings
  FOR EACH ROW EXECUTE FUNCTION public.online_store_touch_updated_at();

-- Seed with Midrand, resolved by name rather than by a UUID pasted into a
-- migration — the id differs between environments, and a wrong one would send
-- every online order to a store that is not expecting them. If no store matches,
-- the row is still created and the setting is left unset, which the application
-- reports as a configuration error rather than guessing a store.
INSERT INTO public.online_store_settings (id, fulfillment_store_id, updated_by)
VALUES (
  true,
  (SELECT id FROM public.stores WHERE name ILIKE '%midrand%' ORDER BY created_at LIMIT 1),
  'migration:20260909120000'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.online_store_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.online_store_settings IS
  'Singleton online-store configuration. fulfillment_store_id is the CDASH store that fulfils online orders; directors change it from the dashboard.';
COMMENT ON TABLE public.online_orders IS
  'Delivery record for an online order — address, phone, notes, tracking — plus exchange_id, the CDASH exchange that owns the money. Not a source of truth for money.';
