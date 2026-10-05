# DLC Online Store

This app is the customer-facing store for the existing CDASH Supabase project.
It uses the CDASH `members.member_id` as the customer identifier and reads live
online prices/inventory through server-side routes.

Every full page load starts with an 18+ confirmation. After that, the store
requires an active CDASH Member ID before the catalogue is mounted or served by
the API. The member access is stored in a signed HTTP-only cookie.

## Storefront

The customer-facing site (lounge, collections, product pages) is the static
site in `public/` — `index.html`, `strains.html`, `product.html`. `/` serves the
lounge (see the rewrite in `next.config.mjs`). It reads everything live through
the same API routes as the React pages:

- `public/age-gate.js` — 18+ check, then the CDASH Member ID
  (`/api/access/age`, `/api/members/session`, `/api/members/verify`).
- `public/store.js` — catalogue (`/api/catalog`) and saved bag (`/api/cart`),
  and the mapping from CDASH `product_type`/`grade` onto the site's shelves:
  Buds/Flower and Pre-rolls by cultivation tier, Wellness CBD, and everything
  else under MORE by product type.

Checkout, account, registration and order pages remain React pages in `app/`.

Online exchange requests are **collection only**. Members book their own Uber to
the fulfilment store; checkout and the confirmation page show that store's name,
address and phone from CDASH `stores` (`getCollectionPoint` in
`lib/store-settings.ts`), with an "Open in Uber" link. There is no delivery
address — `online_orders.delivery_address` records the collection point instead.
`/menu` is the older single-list store with filters and saved items.

## Legal pages and acceptance records

`public/privacy.html`, `public/terms.html` and `public/cookies.html` are generated
by `python3 scripts/build-legal-pages.py`. Fill in the company details at the top
of that script and re-run it; unfilled details show as highlighted placeholders.

Every registration and exchange request stores evidence that the member accepted
the terms in `online_legal_acceptances` (migration
`20260929120000_legal_acceptances.sql`). Nothing is created if that record cannot
be written, so **apply the migration before deploying** or registrations and
exchange requests will be refused. To change the terms: edit the pages, bump
`TERMS_VERSION` / `PRIVACY_VERSION` in `lib/legal.ts`, and rebuild the pages.

To see a member's acceptance history:

```sql
select context, terms_version, privacy_version, accepted_at, ip_address, exchange_id, statement
from online_legal_acceptances where member_id = 'DLC-1234-56' order by accepted_at desc;
```

## Setup

1. Copy `.env.example` to `.env.local`.
2. Use the same `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as CDASH.
3. Apply `supabase/migrations/20260826100000_create_online_store.sql` to the same Supabase project.
4. Insert/publish rows in `online_products` for products you want customers to see.
5. Install dependencies and run `npm run dev`.

Example catalogue entry (replace the product identity and store UUID with a real
CDASH inventory item):

```sql
insert into public.online_products
  (slug, display_name, product_type, strain_name, grade, is_published)
values
  ('example-product', 'Example Product', 'Edibles', 'Example Product', null, true);
```

The service-role key is server-only. It must never be used in client components or
exposed as a `NEXT_PUBLIC_*` variable.

## Card settlement (Paystack)

Every online exchange request is settled by card through Paystack before the
team prepares it. The store never decides what is owed and never marks anything
settled itself — CDASH does both. The flow (`lib/settlement.ts`):

1. **Review & request** creates the CDASH exchange PENDING, as before, then asks
   CDASH what it owes on card (`POST /api/store/exchanges/:id/settle`
   `{action:"quote"}` — binding, unlike the bag preview) and opens a Paystack
   checkout for exactly that. The member goes straight to Paystack.
2. Paystack returns the member to `/exchange/:id?reference=…` and also calls
   `/api/webhooks/paystack`. Either one settles; both are safe together.
3. The store verifies the payment with Paystack and asks CDASH to settle.
   CDASH verifies it with Paystack again, deducts the stock and awards points.
4. If CDASH refuses for good (stock gone, order already resolved, amount moved)
   the payment is returned to the card automatically. An outage is retried, not
   refunded.

Every checkout is a row in `online_payment_attempts`. **A row in `paid` or
`refunding` for more than a few minutes is money taken with no outcome** — look
at `last_error` and resolve it by hand:

```sql
select reference, order_id, status, amount_cents, last_error, updated_at
from online_payment_attempts where status in ('paid', 'refunding') order by updated_at;
```

Setup: apply `20261005120000_paystack_settlement.sql`; set `PAYSTACK_SECRET_KEY`
here **and** in CDASH; deploy the CDASH `/api/store/exchanges/:id/settle` route;
set the Paystack webhook URL. Test with Paystack test keys and card
4084 0840 8408 4081.

DLC Credits are not spendable online: CDASH settles online exchanges at the card
rate with no redemption. Members spend credits in the lounge.

## WhatsApp

WhatsApp should send customers to this checkout first. A Meta WhatsApp Cloud API
webhook can later create the same `online_orders` records using `channel = 'whatsapp'`.
