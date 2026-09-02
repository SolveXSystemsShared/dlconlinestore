# Scoping the store's database access

**Status:** not started. The storefront runs on the CDASH `service_role` key.
**Risk accepted for now:** anyone who can deploy to the Vercel project, or who
finds a code-execution bug in the storefront, reaches the whole CDASH database.

This is a runbook, not a proposal — every step below is written to be executed.
It is kept in the repo rather than a tracker because the grants name real
tables, and they must be updated in the same commit as any query that adds one.

## Why bother

`service_role` bypasses row-level security and reaches every table in the
project: exchanges, staff PINs, compliance documents, the lot. The storefront
needs nine tables and four functions:

| Access | Objects |
| --- | --- |
| `SELECT` | `users`, `online_products`, `online_sellable_inventory`, `inventory_items`, `online_inventory_reservations` |
| `SELECT`, `INSERT` | `members` |
| `INSERT` | `audit_logs`, `online_order_items` |
| `SELECT`, `INSERT`, `UPDATE` | `online_orders` |
| `EXECUTE` | `reserve_online_order`, `cancel_online_order`, `finalize_online_order`, `sync_online_products` |

Nothing is ever deleted by the storefront, so no `DELETE` is granted anywhere.
The reservation and order-event rows are written inside the `SECURITY DEFINER`
functions, which run as their owner, so the caller needs no write grant there.

## Before you start

Two things make this project a good candidate. Confirm both are still true:

- The project signs legacy **HS256** JWTs. Check the current service key decodes
  to `{"alg":"HS256"}` with `"role":"service_role"`. If the project has migrated
  to the newer publishable/secret key system, the JWT step below does not apply
  and this runbook needs revisiting.
- You can reach **Supabase → Settings → API → JWT Secret**. That secret signs
  the token in step 3 and must never leave that screen and your terminal.

## 1. Create the role and grant it what the store needs

```sql
-- A login-less role PostgREST can switch into, nothing more.
CREATE ROLE dlc_store NOLOGIN;
GRANT dlc_store TO authenticator;
GRANT USAGE ON SCHEMA public TO dlc_store;

-- Read-only.
GRANT SELECT ON public.users                          TO dlc_store;
GRANT SELECT ON public.online_products                TO dlc_store;
GRANT SELECT ON public.online_sellable_inventory      TO dlc_store;
GRANT SELECT ON public.inventory_items                TO dlc_store;
GRANT SELECT ON public.online_inventory_reservations  TO dlc_store;

-- Registration reads to check duplicates, then writes one row.
GRANT SELECT, INSERT ON public.members                TO dlc_store;

-- Append-only.
GRANT INSERT ON public.audit_logs                     TO dlc_store;
GRANT INSERT ON public.online_order_items             TO dlc_store;

-- Orders are created, then moved between statuses.
GRANT SELECT, INSERT, UPDATE ON public.online_orders  TO dlc_store;

-- Signatures verified against the migrations; defaulted arguments are still
-- part of the identity, so they must all be listed.
GRANT EXECUTE ON FUNCTION public.reserve_online_order(uuid)                    TO dlc_store;
GRANT EXECUTE ON FUNCTION public.cancel_online_order(uuid, text)               TO dlc_store;
GRANT EXECUTE ON FUNCTION public.finalize_online_order(uuid, text, jsonb)      TO dlc_store;
GRANT EXECUTE ON FUNCTION public.sync_online_products()                        TO dlc_store;
```

Re-check those signatures if the functions have been altered since. A `GRANT
EXECUTE` naming arguments that do not match raises `42883` rather than silently
doing nothing, so a wrong signature fails loudly here instead of at checkout.

## 2. Give it RLS policies of its own

This is the step that will bite. `service_role` bypasses RLS; `dlc_store` does
not. Several CDASH tables carry a permissive `USING (true)` policy with no `TO`
clause, which applies to every role and would cover the new one — but do not
rely on reading that from the API, because `pg_policies` is not exposed there.
Read it in the SQL editor first:

```sql
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'users','members','audit_logs','inventory_items',
    'online_products','online_orders','online_order_items',
    'online_inventory_reservations'
  )
ORDER BY tablename, policyname;
```

Where a table has no policy that covers `dlc_store`, add an explicit one rather
than loosening an existing policy — a policy named for this role is one you can
later drop without wondering what else depended on it:

```sql
CREATE POLICY dlc_store_read ON public.users
  FOR SELECT TO dlc_store USING (true);
```

Repeat per table and command, matching the grants in step 1. Keep every policy
prefixed `dlc_store_` so the whole set can be found and removed together.

## 3. Mint the token

The storefront talks to PostgREST, which decides the role from the JWT's `role`
claim. Sign one with the project's JWT secret — no expiry shorter than you are
willing to be paged for:

```bash
python3 - <<'PY'
import hmac, hashlib, base64, json, time
secret = input("JWT secret: ").strip()
b = lambda o: base64.urlsafe_b64encode(json.dumps(o, separators=(",", ":")).encode()).rstrip(b"=")
now = int(time.time())
msg = b({"alg": "HS256", "typ": "JWT"}) + b"." + b({
    "role": "dlc_store", "iss": "supabase",
    "iat": now, "exp": now + 60 * 60 * 24 * 365 * 5,
})
sig = base64.urlsafe_b64encode(hmac.new(secret.encode(), msg, hashlib.sha256).digest()).rstrip(b"=")
print((msg + b"." + sig).decode())
PY
```

Note the expiry you chose. An expired storefront key fails exactly like a
missing one, and the error will not say so.

## 4. Teach the app to prefer it

`lib/supabase-admin.ts` reads `SUPABASE_SERVICE_ROLE_KEY`. Make it prefer a
scoped key and keep the old one as a fallback, so the cutover is a config change
and the rollback is deleting one variable:

```ts
const key = env("SUPABASE_STORE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY")
```

Update the missing-variable message alongside it, so a misconfiguration still
names what it wants.

## 5. Cut over

```bash
printf '%s' "<the token from step 3>" | npx vercel env add SUPABASE_STORE_KEY production
npx vercel redeploy "$(npx vercel ls dlconlinestore-8qpm --prod | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | head -1)"
```

Leave `SUPABASE_SERVICE_ROLE_KEY` in place until step 6 passes. Removing it is
the last action, not the first.

## 6. Prove it before trusting it

Every one of these exercises a different grant. A scoped role that has not been
through all six is a role that will fail on whichever one you skipped.

- Verify an ordinary member ID — reads `members`.
- Verify a staff ID such as the Test Director — reads `users`.
- Load the catalogue — reads `online_products`, the sellable view and reservations.
- Register a throwaway member, then delete it — writes `members` and `audit_logs`.
- Place an order and cancel it — writes `online_orders`, `online_order_items`,
  and calls `reserve_online_order` and `cancel_online_order`.
- Change a stock row in CDASH and confirm the catalogue follows — the trigger
  runs `sync_online_products` as its definer, so this proves the trigger path
  still works under the new role.

A `42501 permission denied` names the table it wanted. Add that grant, redeploy,
carry on — do not reach for `service_role` to make the error go away.

## 7. Close it out

Once step 6 is green:

```bash
npx vercel env rm SUPABASE_SERVICE_ROLE_KEY production --yes
```

Then rotate the old service key in Supabase. It has been in a local `.env.local`
and a Vercel variable; rotating is what actually ends its usefulness to anyone
who saw it. Confirm CDASH itself is using its own copy before you do.

## Rollback

Delete `SUPABASE_STORE_KEY` and redeploy. The fallback in step 4 puts the store
back on the service role key immediately. The role, grants and policies are
inert while unused, so they can stay until you try again.

## Related

- `MEMBER_GATE_SECRET` is set independently, so rotating the Supabase key no
  longer signs every member out. Keep it that way.
- `SUPABASE_URL` is server-only and deliberately carries no `NEXT_PUBLIC_`
  prefix. Do not reintroduce one: that prefix makes Next inline the value at
  build time, and Vercel withholds sensitive variables from the build, which is
  what took the store down once already.
