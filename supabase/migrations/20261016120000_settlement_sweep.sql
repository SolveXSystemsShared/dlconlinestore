-- The settlement sweep (lib/settlement-sweep.ts) finishes what the webhook and
-- the member's return left behind: payments nobody reported, settlements that
-- hit an outage, refunds that did not go through, and requests never settled.
--
-- alerted_at records when the team was told an attempt is still stuck after
-- the sweep has retried it for an hour, so they are told once, not every run.

ALTER TABLE public.online_payment_attempts
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz NULL;

-- The sweep's two reads: attempts still open, and requests still unsettled.
CREATE INDEX IF NOT EXISTS idx_online_payment_attempts_open
  ON public.online_payment_attempts (created_at)
  WHERE status IN ('initialized', 'paid', 'refunding');

CREATE INDEX IF NOT EXISTS idx_online_orders_pending_payment
  ON public.online_orders (created_at)
  WHERE status = 'pending_payment';

COMMENT ON TABLE public.online_payment_attempts IS
  'One row per Paystack checkout opened for an online exchange request. The settlement sweep retries paid/refunding rows on its own and alerts the team (alerted_at) only if one is still stuck after an hour.';
