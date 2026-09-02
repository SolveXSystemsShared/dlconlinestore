import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

/**
 * Reads an environment variable at request time.
 *
 * Next.js textually inlines every literal `process.env.NEXT_PUBLIC_*` when it
 * builds, and Vercel withholds variables marked Sensitive from the build. An
 * inlined read of a Sensitive NEXT_PUBLIC_ variable is therefore frozen as
 * `undefined` in the bundle, even though the value is present in the running
 * function — which is exactly how a fully configured deployment ended up
 * reporting "Supabase server environment is not configured". Indexing
 * dynamically is not inlined, so this sees the real environment.
 */
function env(name: string) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

export function getSupabaseAdmin() {
  if (client) return client

  // SUPABASE_URL is the name to prefer: this URL is only ever used here, on the
  // server, so it has no business carrying the NEXT_PUBLIC_ prefix that marks a
  // value as safe to ship to browsers. NEXT_PUBLIC_SUPABASE_URL stays supported
  // so existing deployments keep working.
  const url = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL")
  const key = env("SUPABASE_SERVICE_ROLE_KEY")

  // Name what is actually missing. The old message said only that something was
  // wrong, which left a misconfigured deployment looking like a broken one.
  if (!url || !key) {
    const missing = [!url && "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)", !key && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean)
    throw new Error(`Supabase server environment is not configured: missing ${missing.join(" and ")}`)
  }

  client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return client
}
