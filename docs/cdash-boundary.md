# The CDASH boundary

The store and CDASH run against one Postgres. The boundary is therefore a
discipline, not a wall, so it is written down.

**READ freely.** Catalogue, inventory levels, members, prices.

**NEVER WRITE:** `exchanges`, exchange line items, `inventory_items`,
`member_points_balances`, `member_points_ledger`, `member_buy_ten_progress`,
`member_buy_ten_ledger`, `lounge_memberships`, `lounge_visits`,
`instore_credits`.

Those tables are money, stock and reward state. CDASH owns every write to them,
because a write that skips `POST /api/exchanges` skips the whole §7 waterfall:
promo-or-normal price, ONE discount (card XOR cash), DLC Credit redemption up to
the 20% basket cap, banded points on the net actually paid, Buy-10 progress on
paid units only, then the behaviour bonuses.

`online_orders` and `online_order_items` stay ours. They are the delivery
record — address, phone, notes, tracking — plus `exchange_id`, a reference to
the CDASH exchange. They are not a source of truth for money.

## The order lifecycle

1. **Quote.** `POST /api/store/quote` runs the waterfall over our catalogue
   prices and writes nothing. Both channels come back; the checkout shows both,
   because §7 rule 2 gives one discount and it matches how the member pays,
   which online is only known at the door. `authoritative: false` is not
   decoration — a stale catalogue price gives a wrong quote and then a rejected
   settlement, never a wrong charge.
2. **Create.** `POST /api/exchanges` with `isOnline: true` creates the order
   PENDING. No stock moves and nothing is earned, because §7 step 4 earns on
   "the net amount actually paid" and an unsettled order has no such amount. We
   send no prices: CDASH resolves them itself.
3. **Record.** The returned exchange id is stored on our `online_orders` row.
4. **Settle.** CDASH staff mark the order paid from their pending queue. That is
   where stock leaves and where points, Buy-10 progress, referral and birthday
   bonuses land. The store cannot do this and should not try:
   `POST /api/exchanges/:id/status` requires a staff or manager session, not the
   store API key.

## Required CDASH setup

CDASH derives an exchange's store from `staffName`. Create a CDASH user named
exactly **`Online Store`**, role `staff`, assigned to the store that fulfils
online orders. Without it the order lands with a null store and appears in
nobody's pending queue — it looks like the order vanished.

Which store that is now lives in `online_store_settings.fulfillment_store_id`,
seeded to Midrand and changed by directors at `/settings/fulfilment`. The CDASH
user's own store assignment must be kept in step with it.

## Why the storefront no longer reserves stock

`reserve_online_order` wrote holds into `online_inventory_reservations`. Those
holds are invisible to CDASH, so the till sells the same unit regardless; and
nothing consumes them now that `finalize_online_order` is gone, so they would
leak until they expired. The real protection is CDASH's own atomic deduction at
settlement, which rejects an order it cannot fill rather than overselling.

The function and its table are left in place, unused, because dropping them
would take `cancel_online_order` with them. Nothing calls it.

**Open:** an order that CDASH cannot fill fails at settlement rather than at
checkout. Closing that needs a stock signal from CDASH, not a hold from us.

## `finalize_online_order` is gone

Dropped in `supabase/migrations/20260909120000_cdash_owns_money.sql`. It wrote a
row into `public.exchanges` itself at the undiscounted subtotal, stamped it
`paid`, and decremented `inventory_items` directly — bypassing the entire
programme and risking a double decrement against the CDASH path. It was
`SECURITY DEFINER`, so revoking table grants would not have contained it.

It never fired. As of 2026-09-10 `online_orders` held 0 rows and no exchange
carried `staff_member = 'Online Store'`; all 14 186 exchanges were attributable
to named staff. Nothing in the reported figures was distorted and there was
nothing to unwind.

Do not re-grant `EXECUTE` on it. See `docs/service-role-hardening.md`.
