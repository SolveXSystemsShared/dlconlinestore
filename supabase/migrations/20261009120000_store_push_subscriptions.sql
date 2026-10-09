-- Devices a member has allowed the store to send updates to (web push).
-- Written by the store (POST /api/push/subscribe) and read by CDASH, which sends
-- the update when an exchange moves. One row per browser or installed app.
--
-- Safe to run more than once, and by itself in the Supabase SQL editor.
CREATE TABLE IF NOT EXISTS public.store_push_subscriptions (
  endpoint     text PRIMARY KEY,
  member_id    text NOT NULL,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_push_subscriptions_member
  ON public.store_push_subscriptions (member_id);

-- Server-side only: the service role bypasses RLS and nothing else should read it.
ALTER TABLE public.store_push_subscriptions ENABLE ROW LEVEL SECURITY;
