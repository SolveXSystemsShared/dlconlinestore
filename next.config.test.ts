import { afterEach, describe, expect, it, vi } from "vitest"

type Rule = { source: string; headers: Array<{ key: string; value: string }> }

async function productionHeaders(): Promise<Rule[]> {
  vi.stubEnv("NODE_ENV", "production")
  // @ts-expect-error -- the config is plain JavaScript with no declaration file.
  const { default: config } = await import("./next.config.mjs")
  return (config as { headers(): Promise<Rule[]> }).headers()
}

describe("proxy body buffering", () => {
  it("stops a full 1 MB past the largest route cap, so a cut-off body is still too large", async () => {
    // @ts-expect-error -- the config is plain JavaScript with no declaration file.
    const { default: config } = await import("./next.config.mjs")
    const { MAX_BODY, MAX_REGISTRATION_BODY } = await import("./lib/request-body")
    const limit = (config as { experimental: { proxyClientMaxBodySize: number } }).experimental.proxyClientMaxBodySize
    expect(limit).toBe(2 * 1024 * 1024)
    // Next drops the chunk that crosses the limit; Node reads sockets in
    // chunks of at most 64 KB, far less than this margin.
    expect(limit - MAX_REGISTRATION_BODY).toBeGreaterThanOrEqual(MAX_REGISTRATION_BODY)
    expect(limit).toBeGreaterThan(MAX_BODY)
  })
})

const cspOf = (rule: Rule) => rule.headers.filter((header) => header.key === "Content-Security-Policy").map((header) => header.value)

describe("Content-Security-Policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("gives the storefront script-src 'self' and leaves the React pages as they were", async () => {
    const rules = await productionHeaders()
    const all = rules.findIndex((rule) => rule.source === "/:path*")
    const root = rules.findIndex((rule) => rule.source === "/")
    const html = rules.findIndex((rule) => rule.source === "/:file(.*\\.html)")

    // Later rules win for a repeated key, so the storefront's must come after.
    expect(all).toBeGreaterThanOrEqual(0)
    expect(root).toBeGreaterThan(all)
    expect(html).toBeGreaterThan(all)

    const [react] = cspOf(rules[all])
    const [storefront] = cspOf(rules[root])
    expect(cspOf(rules[html])).toEqual([storefront])
    expect(react).toContain("script-src 'self' 'unsafe-inline';")
    expect(storefront).toContain("script-src 'self';")
    // Only script-src differs.
    expect(storefront).toBe(react.replace("script-src 'self' 'unsafe-inline';", "script-src 'self';"))
    expect(storefront).toContain("img-src 'self' data: blob: https:")
    expect(storefront).toContain("font-src 'self' data: https://cdn.gpteng.co")
  })

  it("does not ask browsers to upgrade requests (WebKit applies it to http://localhost)", async () => {
    const rules = await productionHeaders()
    for (const rule of rules) for (const value of cspOf(rule)) expect(value).not.toContain("upgrade-insecure-requests")
  })

  it("sends exactly one policy per matching rule, and only these three rules send one", async () => {
    const rules = await productionHeaders()
    const sending = rules.filter((rule) => cspOf(rule).length)
    expect(sending.map((rule) => rule.source)).toEqual(["/:path*", "/", "/:file(.*\\.html)"])
    for (const rule of sending) expect(cspOf(rule)).toHaveLength(1)
  })
})
