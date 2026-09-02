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

  // Server-only, and named accordingly. NEXT_PUBLIC_ marks a value as safe to
  // ship to browsers, which this is not — and the prefix is what made Next
  // inline it at build time and freeze it as undefined in the first place.
  const url = env("SUPABASE_URL")
  const key = env("SUPABASE_SERVICE_ROLE_KEY")

  // Name what is actually missing. The old message said only that something was
  // wrong, which left a misconfigured deployment looking like a broken one.
  if (!url || !key) {
    const missing = [!url && "SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean)
    throw new Error(`Supabase server environment is not configured: missing ${missing.join(" and ")}`)
  }

  client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return client
}
