-- Keep online_products in step with CDASH inventory.
--
-- online_products is the storefront's editorial layer: what a thing is called,
-- how it is described, which picture it gets, whether it is on sale. CDASH
-- remains the authority on what actually exists and what it costs. Publishing
-- by hand meant the two drifted the moment a new strain landed or a line sold
-- out, so the derived half is now generated and the curated half is never
-- touched by the generator.
--
-- What is derived : one row per sellable (product_type, strain_name, grade),
--                   and whether it can be listed at all — a product CDASH has
--                   not priced is withdrawn, because checkout could not take
--                   money for it anyway.
-- What is curated : description, image_url, price_override, sort_order,
--                   display_name once a human has changed it, and an
--                   is_published a human has turned off.
--
-- Nothing here deletes. A product whose stock runs out keeps its row and
-- simply stops rendering (getCatalog skips zero availability); when CDASH
-- receives it again it returns with its description and photo intact.

-- ---------------------------------------------------------------------------
-- Slug helper. Slugs are cosmetic — the app keys off id — but they are UNIQUE,
-- so they must be derived deterministically and must not collide.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_product_slug(
  p_product_type text,
  p_strain_name text,
  p_grade text
) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(trim(both '-' from regexp_replace(
    lower(coalesce(p_product_type, '') || '-' || coalesce(p_strain_name, '') || '-' || coalesce(p_grade, '')),
    '[^a-z0-9]+', '-', 'g')), '')
$$;

-- The natural key of a storefront product. Grade is part of it: Greenhouse and
-- Hydroponic of the same strain are different products at different prices.
-- COALESCE because a NULL grade must still compare equal to another NULL grade,
-- which a plain unique index would not enforce.
CREATE UNIQUE INDEX IF NOT EXISTS idx_online_products_natural_key
  ON public.online_products (product_type, lower(trim(strain_name)), coalesce(grade, ''));

-- Marks rows the generator created, so a hand-built product is never rewritten
-- by it. Existing rows are assumed curated.
ALTER TABLE public.online_products
  ADD COLUMN IF NOT EXISTS synced_from_cdash boolean NOT NULL DEFAULT false;

ALTER TABLE public.online_products
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NULL;

-- Set when the generator, not a person, took a product off the store. It is
-- what lets the generator put the product back later without ever overriding
-- a human who unpublished something deliberately (that leaves this NULL).
ALTER TABLE public.online_products
  ADD COLUMN IF NOT EXISTS unpublished_reason text NULL;

-- Every row present when this migration first runs was seeded from CDASH by
-- the storefront, so mark them generated. Anything added by hand afterwards
-- takes the false default and the generator leaves its name alone.
UPDATE public.online_products SET synced_from_cdash = true WHERE last_synced_at IS NULL;

-- ---------------------------------------------------------------------------
-- The sync itself. Idempotent: running it twice changes nothing the second time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_online_products()
RETURNS TABLE (inserted integer, updated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_updated  integer := 0;
BEGIN
  WITH source AS (
    -- One row per distinct sellable product.
    --
    -- The price is read only to decide whether the product can go on the store
    -- at all. It is never stored: getCatalog takes the live figure from the
    -- view at request time, so repricing in CDASH needs no resync. DISTINCT ON
    -- picks the oldest batch, which is the one getCatalog quotes from and the
    -- one reserve_online_order draws down first.
    SELECT DISTINCT ON (s.product_type, lower(trim(s.strain_name)), coalesce(s.grade, ''))
      s.product_type,
      trim(s.strain_name) AS strain_name,
      s.grade,
      coalesce(s.online_price, s.exchange_price, 0) AS unit_price
    FROM public.online_sellable_inventory s
    WHERE coalesce(trim(s.strain_name), '') <> ''
      AND coalesce(trim(s.product_type), '') <> ''
    ORDER BY s.product_type, lower(trim(s.strain_name)), coalesce(s.grade, ''), s.date_received, s.id
  ),
  keyed AS (
    SELECT
      source.*,
      public.online_product_slug(product_type, strain_name, grade) AS base_slug,
      substr(md5(product_type || '|' || lower(strain_name) || '|' || coalesce(grade, '')), 1, 6) AS key_hash
    FROM source
  ),
  slugged AS (
    SELECT
      keyed.*,
      -- Two different products can reduce to the same slug ("ECS600" and
      -- "ECS 600"). Disambiguate with a stable hash of the natural key, and do
      -- the same when the base slug is already claimed by a different product.
      CASE
        WHEN count(*) OVER (PARTITION BY base_slug) > 1
          OR EXISTS (
            SELECT 1 FROM public.online_products p
            WHERE p.slug = keyed.base_slug
              AND (p.product_type, lower(trim(p.strain_name)), coalesce(p.grade, ''))
                  IS DISTINCT FROM (keyed.product_type, lower(keyed.strain_name), coalesce(keyed.grade, ''))
          )
        THEN keyed.base_slug || '-' || keyed.key_hash
        ELSE keyed.base_slug
      END AS slug
    FROM keyed
  ),
  upserted AS (
    INSERT INTO public.online_products AS p (
      slug, display_name, product_type, strain_name, grade,
      store_id, is_published, unpublished_reason, synced_from_cdash, last_synced_at
    )
    SELECT
      slug,
      strain_name,
      product_type,
      strain_name,
      grade,
      -- Left unscoped on purpose: the catalogue already filters inventory by
      -- store, so one product row serves every branch and shows only where
      -- there is stock.
      NULL,
      unit_price > 0,
      CASE WHEN unit_price > 0 THEN NULL ELSE 'no_price' END,
      true,
      now()
    FROM slugged
    ON CONFLICT (product_type, lower(trim(strain_name)), coalesce(grade, '')) DO UPDATE
      SET last_synced_at = now(),
          -- Only ever refresh the generated name, and only while no human has
          -- renamed it. price_override, description and sort_order are
          -- curation and are never overwritten here.
          display_name = CASE WHEN p.synced_from_cdash THEN excluded.display_name ELSE p.display_name END,
          -- An unpriced product must not be listed: with nothing to charge,
          -- checkout would refuse it anyway. Withdrawing it is a statement of
          -- fact, so the generator may do it to any product...
          is_published = CASE
            WHEN excluded.unpublished_reason = 'no_price' THEN false
            -- ...but it may only put a product back that it withdrew itself.
            -- A product a person unpublished has no reason recorded and stays
            -- off the store until that person says otherwise.
            WHEN p.unpublished_reason = 'no_price' THEN true
            ELSE p.is_published
          END,
          unpublished_reason = CASE
            WHEN excluded.unpublished_reason = 'no_price' THEN 'no_price'
            WHEN p.unpublished_reason = 'no_price' THEN NULL
            ELSE p.unpublished_reason
          END,
          updated_at = now()
    RETURNING (xmax = 0) AS was_insert
  )
  SELECT
    count(*) FILTER (WHERE was_insert),
    count(*) FILTER (WHERE NOT was_insert)
  INTO v_inserted, v_updated
  FROM upserted;

  RETURN QUERY SELECT v_inserted, v_updated;
END;
$$;

COMMENT ON FUNCTION public.sync_online_products() IS
  'Upserts one online_products row per sellable CDASH product, withdrawing any CDASH has not priced. Never deletes and never overwrites curated fields.';

REVOKE ALL ON FUNCTION public.sync_online_products() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_online_products() TO service_role;

-- ---------------------------------------------------------------------------
-- Keep it current without anyone remembering to press a button.
--
-- Statement-level, so a bulk stock-take fires it once rather than per row, and
-- wrapped so that it can never fail a CDASH inventory write: if the sync
-- breaks, CDASH carries on and the storefront is merely late adding a new
-- line. Stock levels themselves are always read live, so nothing here can make
-- the store advertise something it does not have.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_sync_online_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.sync_online_products();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_online_products failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_inventory_items_sync_online_products ON public.inventory_items;

CREATE TRIGGER trigger_inventory_items_sync_online_products
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trigger_sync_online_products();

-- Seed the catalogue from whatever CDASH holds right now.
SELECT * FROM public.sync_online_products();
