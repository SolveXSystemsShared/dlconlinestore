-- One-time sign-in PINs for the online store.
--
-- A Member ID alone is not a secret: it is printed on cards and derived from
-- the last four digits of a phone number. Signing in to the store now needs a
-- six-digit PIN sent by SMS to the mobile number CDASH holds for the member.
--
-- Only a keyed hash of the PIN is stored (HMAC-SHA256 with the store's server
-- secret), never the PIN itself, so a read of this table cannot be replayed as
-- a sign-in. Each PIN expires after 10 minutes, allows 5 wrong guesses, and is
-- consumed on first successful use. The store's own table — CDASH's otp_codes
-- is left alone (see docs/cdash-boundary.md).

CREATE TABLE IF NOT EXISTS public.online_signin_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  ip_address inet NULL
);

CREATE INDEX IF NOT EXISTS idx_online_signin_codes_member
  ON public.online_signin_codes (member_id, created_at DESC);

COMMENT ON TABLE public.online_signin_codes IS
  'SMS sign-in PINs for the online store. Hashed, 10-minute expiry, 5 attempts, single use. Rows older than a day may be deleted.';

-- Reached only through server routes with the service role.
ALTER TABLE public.online_signin_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.online_signin_codes FROM anon, authenticated;
