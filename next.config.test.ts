import { afterEach, describe, expect, it, vi } from "vitest"

type Rule = { source: string; headers: Array<{ key: string; value: string }> }

async function productionHeaders(): Promise<Rule[]> {
  vi.stubEnv("NODE_ENV", "production")
  // @ts-expect-error -- the config is plain JavaScript with no declaration file.
  const { default: config } = await import("./next.config.mjs")
  return (config as { headers(): Promise<Rule[]> }).headers()
}

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

  it("sends exactly one policy per matching rule, and only these three rules send one", async () => {
    const rules = await productionHeaders()
    const sending = rules.filter((rule) => cspOf(rule).length)
    expect(sending.map((rule) => rule.source)).toEqual(["/:path*", "/", "/:file(.*\\.html)"])
    for (const rule of sending) expect(cspOf(rule)).toHaveLength(1)
  })
})
