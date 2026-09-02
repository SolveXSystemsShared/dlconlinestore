-- Member profiles: delivery addresses, saved bag, wishlist.
--
-- All three are keyed by the member's DLC ID as text, the same way
-- online_orders.member_id already is. That is deliberate: CDASH staff shop with
-- a member_number from `users` while everyone else has a member_id from
-- `members`, and a foreign key could only ever point at one of those two
-- tables. The storefront resolves the ID before it writes, so the text column
-- serves both.
--
-- The bag and the wishlist live server-side rather than in the browser so they
-- follow a member between their phone and a laptop, which is the whole point of
-- having an account.

CREATE TABLE IF NOT EXISTS public.online_member_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL,
  -- What the member calls it: "Home", "Mom's place". Never shown to fulfilment.
  label text NULL,
  recipient text NOT NULL,
  phone text NOT NULL,
  line1 text NOT NULL,
  line2 text NULL,
  suburb text NULL,
  city text NULL,
  postal_code text NULL,
  -- Gate codes, "leave with the neighbour", that sort of thing.
  notes text NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_addresses_member
  ON public.online_member_addresses (member_id, created_at DESC);

-- At most one default each. A partial unique index says it once, rather than
-- every write having to remember to clear the previous default.
CREATE UNIQUE INDEX IF NOT EXISTS idx_online_addresses_one_default
  ON public.online_member_addresses (member_id)
  WHERE is_default;

CREATE TABLE IF NOT EXISTS public.online_wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL,
  online_product_id uuid NOT NULL REFERENCES public.online_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Saving the same thing twice is the same wish, not two.
CREATE UNIQUE INDEX IF NOT EXISTS idx_online_wishlist_unique
  ON public.online_wishlist_items (member_id, online_product_id);
CREATE INDEX IF NOT EXISTS idx_online_wishlist_member
  ON public.online_wishlist_items (member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.online_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL,
  online_product_id uuid NOT NULL REFERENCES public.online_products(id) ON DELETE CASCADE,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One line per product; adding again raises the quantity on the existing line.
CREATE UNIQUE INDEX IF NOT EXISTS idx_online_cart_unique
  ON public.online_cart_items (member_id, online_product_id);
CREATE INDEX IF NOT EXISTS idx_online_cart_member
  ON public.online_cart_items (member_id, created_at);

-- A saved bag holds no stock. Availability and price are read live at render
-- and checked again by reserve_online_order, so a bag left for a week cannot
-- quietly sell something that is gone or hold a price that has changed.
COMMENT ON TABLE public.online_cart_items IS
  'Server-side bag so it follows a member across devices. Holds no inventory: availability and price are resolved live.';

-- Same posture as the rest of the online store: the app reaches these through
-- server routes with the service role, never from a browser session.
ALTER TABLE public.online_member_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_wishlist_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_cart_items       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.online_member_addresses FROM anon, authenticated;
REVOKE ALL ON public.online_wishlist_items   FROM anon, authenticated;
REVOKE ALL ON public.online_cart_items       FROM anon, authenticated;
