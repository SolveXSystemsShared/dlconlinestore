-- DLC Online Store
-- Apply to the same Supabase project used by CDASH.
-- The store uses server-side service-role routes; RLS stays enabled so these
-- tables are not directly readable from an anonymous browser session.

CREATE TABLE IF NOT EXISTS public.online_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  product_type text NOT NULL,
  strain_name text NOT NULL,
  grade text NULL,
  description text NULL,
  image_url text NULL,
  price_override numeric(10,2) NULL CHECK (price_override IS NULL OR price_override >= 0),
  store_id uuid NULL REFERENCES public.stores(id),
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_products_published
  ON public.online_products (is_published, store_id, sort_order);

CREATE TABLE IF NOT EXISTS public.online_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('DLC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  member_id text NOT NULL,
  member_name text NOT NULL,
  customer_phone text NOT NULL,
  delivery_address text NOT NULL,
  customer_notes text NULL,
  fulfillment_store_id uuid NULL REFERENCES public.stores(id),
  channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp', 'staff')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_payment', 'paid', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled', 'expired')),
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  payment_reference text NULL,
  payment_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  exchange_id uuid NULL REFERENCES public.exchanges(id),
  idempotency_key text NULL,
  cancellation_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_online_orders_idempotency
  ON public.online_orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_online_orders_status
  ON public.online_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_orders_member
  ON public.online_orders (member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.online_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  online_product_id uuid NULL REFERENCES public.online_products(id),
  product_type text NOT NULL,
  strain_name text NOT NULL,
  grade text NULL,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_order_items_order
  ON public.online_order_items (order_id);

CREATE TABLE IF NOT EXISTS public.online_inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id),
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'consumed', 'expired')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  released_at timestamptz NULL,
  consumed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_online_reservations_inventory_active
  ON public.online_inventory_reservations (inventory_item_id, status)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_online_reservations_order
  ON public.online_inventory_reservations (order_id, status);

CREATE TABLE IF NOT EXISTS public.online_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.online_store_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_online_products_updated_at ON public.online_products;
CREATE TRIGGER trg_online_products_updated_at
  BEFORE UPDATE ON public.online_products
  FOR EACH ROW EXECUTE FUNCTION public.online_store_touch_updated_at();

DROP TRIGGER IF EXISTS trg_online_orders_updated_at ON public.online_orders;
CREATE TRIGGER trg_online_orders_updated_at
  BEFORE UPDATE ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.online_store_touch_updated_at();

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
      WHERE ii.is_archived = false
        AND ii.quantity > 0
        AND lower(trim(ii.strain_name)) = lower(trim(v_item.strain_name))
        AND ii.product_type = v_item.product_type
        AND (v_item.grade IS NULL OR ii.grade = v_item.grade)
        AND (v_order.fulfillment_store_id IS NULL OR ii.store_id = v_order.fulfillment_store_id OR ii.store_id IS NULL)
        AND (ii.stock_status = 'shelf_stock' OR ii.product_type IN (
          'Drinks', 'Rolling Papers', 'Accessories', 'Vapes', 'Dab', 'Dab Hits',
          'Concentrates', 'Shooters', 'Moonsticks', 'Moonstick', 'Pre-rolls',
          'Pre-roll', 'Free Mini J''s', 'Edibles', 'Edible'
        ))
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

CREATE OR REPLACE FUNCTION public.cancel_online_order(p_order_id uuid, p_reason text DEFAULT 'Cancelled')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.online_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_status IN ('paid', 'preparing', 'ready', 'out_for_delivery', 'completed') THEN
    RAISE EXCEPTION 'Paid or fulfilled orders must be cancelled by staff';
  END IF;

  UPDATE public.online_inventory_reservations
  SET status = 'released', released_at = now()
  WHERE order_id = p_order_id AND status = 'active';
  UPDATE public.online_orders
  SET status = 'cancelled', cancellation_reason = p_reason
  WHERE id = p_order_id;
  INSERT INTO public.online_order_events (order_id, event_type, payload)
  VALUES (p_order_id, 'order_cancelled', jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('orderId', p_order_id, 'status', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_online_order(
  p_order_id uuid,
  p_payment_reference text DEFAULT NULL,
  p_payment_details jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.online_orders%ROWTYPE;
  v_reservation record;
  v_exchange_id uuid;
  v_items jsonb;
BEGIN
  SELECT * INTO v_order FROM public.online_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('orderId', v_order.id, 'status', v_order.status, 'exchangeId', v_order.exchange_id, 'idempotent', true);
  END IF;
  IF v_order.status <> 'pending_payment' THEN RAISE EXCEPTION 'Order is not awaiting payment'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.online_inventory_reservations
    WHERE order_id = p_order_id AND status = 'active' AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RAISE EXCEPTION 'Order inventory reservation has expired';
  END IF;

  FOR v_reservation IN
    SELECT r.* FROM public.online_inventory_reservations r
    WHERE r.order_id = p_order_id AND r.status = 'active'
    ORDER BY r.inventory_item_id
    FOR UPDATE
  LOOP
    UPDATE public.inventory_items
    SET quantity = quantity - v_reservation.quantity
    WHERE id = v_reservation.inventory_item_id
      AND quantity >= v_reservation.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory changed before payment was finalized'; END IF;
  END LOOP;

  SELECT jsonb_agg(jsonb_build_object(
    'kind', 'product', 'type', i.product_type, 'name', i.strain_name,
    'grade', i.grade, 'quantity', i.quantity, 'value', i.line_total
  ) ORDER BY i.id) INTO v_items
  FROM public.online_order_items i WHERE i.order_id = p_order_id;

  INSERT INTO public.exchanges (
    member_id, member_name, timestamp, staff_member, total_value, items,
    payment_type, yoco_reference, payment_details, payment_notes, store_id,
    payment_status, paid_at
  ) VALUES (
    v_order.member_id, v_order.member_name, now(), 'Online Store', v_order.subtotal,
    COALESCE(v_items, '[]'::jsonb), 'online', p_payment_reference, p_payment_details,
    v_order.customer_notes, v_order.fulfillment_store_id, 'paid', now()
  ) RETURNING id INTO v_exchange_id;

  UPDATE public.online_inventory_reservations
  SET status = 'consumed', consumed_at = now()
  WHERE order_id = p_order_id AND status = 'active';
  UPDATE public.online_orders
  SET status = 'paid', paid_at = now(), payment_reference = p_payment_reference,
      payment_details = p_payment_details, exchange_id = v_exchange_id
  WHERE id = p_order_id;
  INSERT INTO public.online_order_events (order_id, event_type, payload)
  VALUES (p_order_id, 'payment_confirmed', jsonb_build_object('exchangeId', v_exchange_id, 'paymentReference', p_payment_reference));

  RETURN jsonb_build_object('orderId', p_order_id, 'status', 'paid', 'exchangeId', v_exchange_id);
END;
$$;

ALTER TABLE public.online_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.online_products IS 'Published customer-facing catalogue entries mapped to CDASH inventory identity.';
COMMENT ON TABLE public.online_inventory_reservations IS 'Temporary stock holds preventing web/WhatsApp overselling before payment.';
COMMENT ON FUNCTION public.finalize_online_order(uuid, text, jsonb) IS 'Idempotently consumes an online reservation, creates a CDASH exchange, and marks the order paid.';
