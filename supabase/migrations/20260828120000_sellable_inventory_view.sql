-- Single source of truth for "what may be sold online".
--
-- Previously this rule existed twice: lib/catalog.ts filtered only on
-- is_archived/quantity, while reserve_online_order additionally required
-- stock_status = 'shelf_stock' unless the product type was on an exemption
-- list. The two disagreed, and Buds/Flower fell in the gap — 66 of 85 in-stock
-- flower rows are raw_material, so the storefront advertised them while
-- checkout refused them with "Insufficient inventory".
--
-- The rule now lives here only. Both the catalogue and the reservation read it,
-- so they cannot drift again. CDASH stays the authority: flip an item to
-- shelf_stock (or receive new stock) and it appears online automatically;
-- archive it or drop it to zero and it disappears.

CREATE OR REPLACE VIEW public.online_sellable_inventory AS
SELECT *
FROM public.inventory_items ii
WHERE ii.is_archived = false
  AND ii.quantity > 0
  AND ii.stock_status = 'shelf_stock';

COMMENT ON VIEW public.online_sellable_inventory IS
  'CDASH inventory that may be sold on the online store: on the shelf, in stock, not archived. The catalogue and reserve_online_order both read this so the two can never disagree.';

-- The store talks to Postgres with the service role only. Keep this off the
-- anon/authenticated PostgREST surface so inventory is not publicly readable.
REVOKE ALL ON public.online_sellable_inventory FROM anon, authenticated;
GRANT SELECT ON public.online_sellable_inventory TO service_role;

-- Re-create the reservation with the shared rule.
--
-- It still SELECTs FROM inventory_items rather than from the view, because
-- FOR UPDATE must take its row locks on the real table; the view is used as
-- the membership test. Everything else is unchanged.
CREATE OR REPLACE FUNCTION public.reserve_online_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.online_orders%ROWTYPE;
  v_item record;
  v_stock record;
  v_held numeric;
  v_available numeric;
  v_take numeric;
  v_remaining numeric;
  v_allocations jsonb := '[]'::jsonb;
BEGIN
  UPDATE public.online_inventory_reservations
  SET status = 'expired', released_at = now()
  WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now();

  SELECT * INTO v_order
  FROM public.online_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status = 'pending_payment' AND EXISTS (
    SELECT 1 FROM public.online_inventory_reservations WHERE order_id = p_order_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('orderId', p_order_id, 'status', 'pending_payment', 'idempotent', true);
  END IF;
  IF v_order.status NOT IN ('draft', 'pending_payment') THEN
    RAISE EXCEPTION 'Order cannot be reserved in its current status';
  END IF;

  FOR v_item IN
    SELECT * FROM public.online_order_items WHERE order_id = p_order_id ORDER BY id
  LOOP
    v_remaining := v_item.quantity;

    FOR v_stock IN
      SELECT ii.id, ii.quantity, ii.store_id, ii.date_received
      FROM public.inventory_items ii
      WHERE EXISTS (
          SELECT 1 FROM public.online_sellable_inventory s WHERE s.id = ii.id
        )
        AND lower(trim(ii.strain_name)) = lower(trim(v_item.strain_name))
        AND ii.product_type = v_item.product_type
        AND (v_item.grade IS NULL OR ii.grade = v_item.grade)
        AND (v_order.fulfillment_store_id IS NULL OR ii.store_id = v_order.fulfillment_store_id OR ii.store_id IS NULL)
      ORDER BY (ii.store_id IS NULL), ii.date_received, ii.id
      FOR UPDATE
    LOOP
      SELECT COALESCE(sum(r.quantity), 0) INTO v_held
      FROM public.online_inventory_reservations r
      WHERE r.inventory_item_id = v_stock.id
        AND r.status = 'active'
        AND (r.expires_at IS NULL OR r.expires_at > now());

      v_available := greatest(v_stock.quantity - v_held, 0);
      v_take := least(v_remaining, v_available);

      IF v_take > 0 THEN
        INSERT INTO public.online_inventory_reservations (
          order_id, inventory_item_id, quantity, expires_at
        ) VALUES (
          p_order_id, v_stock.id, v_take, now() + interval '30 minutes'
        );
        v_allocations := v_allocations || jsonb_build_object(
          'orderItemId', v_item.id, 'inventoryItemId', v_stock.id, 'quantity', v_take
        );
        v_remaining := v_remaining - v_take;
      END IF;

      EXIT WHEN v_remaining <= 0;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Insufficient inventory for %', v_item.strain_name;
    END IF;
  END LOOP;

  UPDATE public.online_orders
  SET status = 'pending_payment'
  WHERE id = p_order_id;

  INSERT INTO public.online_order_events (order_id, event_type, payload)
  VALUES (p_order_id, 'order_reserved', jsonb_build_object('allocations', v_allocations));

  RETURN jsonb_build_object('orderId', p_order_id, 'status', 'pending_payment', 'allocations', v_allocations);
END;
$$;
