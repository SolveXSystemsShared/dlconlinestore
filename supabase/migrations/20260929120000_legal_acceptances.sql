-- Evidence of legal acceptance: Terms & Conditions and Privacy Policy.
--
-- Every storefront registration and every exchange request records, server
-- side, that the member accepted the terms: which versions, the exact sentence
-- they ticked, when, and from which IP address and browser. The storefront
-- refuses the registration or request if this row cannot be written, so a
-- member record or exchange request never exists without its evidence.
--
-- Keyed by the member's DLC ID as text, like the other online_* tables (CDASH
-- staff shop on users.member_number, everyone else on members.member_id).
-- member_id is NULL only for the moment between recording a registration's
-- acceptance and CDASH generating the new Member ID; the route links it
-- straight after.
--
-- The evidence columns cannot be edited once written (trigger below). Rows may
-- still be deleted, because POPIA section 14 requires records to be destroyed
-- once the retention period in the Privacy Policy has passed.

CREATE TABLE IF NOT EXISTS public.online_legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NULL,
  context text NOT NULL CHECK (context IN ('registration', 'exchange_request')),
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  statement text NOT NULL,
  ip_address inet NULL,
  user_agent text NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  -- Links to what was accepted. Filled in once that record exists.
  online_order_id uuid NULL REFERENCES public.online_orders(id) ON DELETE SET NULL,
  exchange_id text NULL
);

CREATE INDEX IF NOT EXISTS idx_online_acceptances_member
  ON public.online_legal_acceptances (member_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_acceptances_order
  ON public.online_legal_acceptances (online_order_id)
  WHERE online_order_id IS NOT NULL;

COMMENT ON TABLE public.online_legal_acceptances IS
  'Evidence that a member accepted the Terms & Conditions / Privacy Policy at registration or with an exchange request. Evidence columns are immutable; link columns may only be filled in once.';

-- Evidence is write-once. The only permitted update fills a link column that is
-- still empty (member_id after registration, the order/exchange after a
-- request is created). Everything else is refused, even for the service role.
CREATE OR REPLACE FUNCTION public.online_legal_acceptances_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.context IS DISTINCT FROM OLD.context
     OR NEW.terms_version IS DISTINCT FROM OLD.terms_version
     OR NEW.privacy_version IS DISTINCT FROM OLD.privacy_version
     OR NEW.statement IS DISTINCT FROM OLD.statement
     OR NEW.ip_address IS DISTINCT FROM OLD.ip_address
     OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
     OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
    RAISE EXCEPTION 'online_legal_acceptances: acceptance evidence cannot be changed';
  END IF;
  IF (OLD.member_id IS NOT NULL AND NEW.member_id IS DISTINCT FROM OLD.member_id)
     OR (OLD.online_order_id IS NOT NULL AND NEW.online_order_id IS DISTINCT FROM OLD.online_order_id)
     OR (OLD.exchange_id IS NOT NULL AND NEW.exchange_id IS DISTINCT FROM OLD.exchange_id) THEN
    RAISE EXCEPTION 'online_legal_acceptances: a link that is already set cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_online_legal_acceptances_guard ON public.online_legal_acceptances;
CREATE TRIGGER trg_online_legal_acceptances_guard
  BEFORE UPDATE ON public.online_legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.online_legal_acceptances_guard();

-- Same posture as the rest of the online store: reached only through server
-- routes with the service role, never from a browser session.
ALTER TABLE public.online_legal_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.online_legal_acceptances FROM anon, authenticated;
