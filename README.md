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

## WhatsApp and payments

WhatsApp should send customers to this checkout first. A Meta WhatsApp Cloud API
webhook can later create the same `online_orders` records using `channel = 'whatsapp'`.
Payment-provider webhooks should verify the provider signature and then call
`/api/webhooks/payment`; the database finalization function is idempotent.
