-- Online settlement through Paystack.
--
-- Every exchange request is now settled by card online before the team prepares
-- it. One row here per Paystack checkout the store opens: a member can abandon
-- a checkout and start another, and each needs its own reference, so the
-- payment lives in its own table rather than on online_orders.
--
-- The lifecycle of an attempt:
--   initialized → paid → settled       the normal path: Paystack took the money,
--                                       CDASH settled the exchange
--   initialized → failed               Paystack reports it abandoned or failed
--   paid → refunding → refunded        CDASH refused the settlement (stock short,
--                                       order already resolved, amount moved), so
--                                       the money goes back to the member's card
--
-- This is a payment record, not a money ledger. CDASH stays the source of truth
-- for what an exchange cost and earned; see docs/cdash-boundary.md.

CREATE TABLE IF NOT EXISTS public.online_payment_attempts (
  reference text PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  exchange_id text NOT NULL,
  member_id text NOT NULL,
  -- What Paystack was asked to collect, in cents. The binding card figure from
  -- CDASH at the moment the checkout opened.
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'initialized'
    CHECK (status IN ('initialized', 'paid', 'settled', 'failed', 'refunding', 'refunded')),
  paystack_status text NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL,
  settled_at timestamptz NULL,
  refunded_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_online_payment_attempts_order
  ON public.online_payment_attempts (order_id, created_at DESC);

-- Paid but neither settled nor refunded: money taken with no outcome yet. This
-- should be empty; anything here for more than a few minutes needs a person.
CREATE INDEX IF NOT EXISTS idx_online_payment_attempts_unresolved
  ON public.online_payment_attempts (updated_at)
  WHERE status IN ('paid', 'refunding');

DROP TRIGGER IF EXISTS trg_online_payment_attempts_updated_at ON public.online_payment_attempts;
CREATE TRIGGER trg_online_payment_attempts_updated_at
  BEFORE UPDATE ON public.online_payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.online_store_touch_updated_at();

-- Service role only, like every online_* table.
ALTER TABLE public.online_payment_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.online_payment_attempts IS
  'One row per Paystack checkout opened for an online exchange request. status paid/refunding for more than a few minutes = money taken with no outcome; needs a person.';
