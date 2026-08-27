# DLC Online Store

This app is the customer-facing store for the existing CDASH Supabase project.
It uses the CDASH `members.member_id` as the customer identifier and reads live
online prices/inventory through server-side routes.

Every full page load starts with an 18+ confirmation. After that, the store
requires an active CDASH Member ID before the catalogue is mounted or served by
the API. The member access is stored in a signed HTTP-only cookie.

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
