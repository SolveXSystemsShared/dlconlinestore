import { readdirSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match"

type Rule = { source: string; headers: Array<{ key: string; value: string }> }

async function loadConfig() {
  // @ts-expect-error -- the config is plain JavaScript with no declaration file.
  return (await import("./next.config.mjs")) as {
    default: { headers(): Promise<Rule[]>; experimental: { proxyClientMaxBodySize: number } }
    REACT_ROUTES: string[]
  }
}

async function productionHeaders(): Promise<Rule[]> {
  vi.stubEnv("NODE_ENV", "production")
  return (await loadConfig()).default.headers()
}

describe("proxy body buffering", () => {
  it("stops a full 1 MB past the largest route cap, so a cut-off body is still too large", async () => {
    const { default: config } = await loadConfig()
    const { MAX_BODY, MAX_REGISTRATION_BODY } = await import("./lib/request-body")
    const limit = config.experimental.proxyClientMaxBodySize
    expect(limit).toBe(2 * 1024 * 1024)
    // Next drops the chunk that crosses the limit; Node reads sockets in
    // chunks of at most 64 KB, far less than this margin.
    expect(limit - MAX_REGISTRATION_BODY).toBeGreaterThanOrEqual(MAX_REGISTRATION_BODY)
    expect(limit).toBeGreaterThan(MAX_BODY)
  })
})

const cspOf = (rule: Rule) => rule.headers.filter((header) => header.key === "Content-Security-Policy").map((header) => header.value)

/** The policy Next would send for a path: every matching rule applies, and the last value for a key wins. */
function policyFor(rules: Rule[], path: string) {
  let policy: string | undefined
  for (const rule of rules) {
    if (!getPathMatch(rule.source)(path)) continue
    for (const value of cspOf(rule)) policy = value
  }
  return policy
}

/**
 * Every page route under app/, with a sample path for it: route groups and
 * parallel slots drop out, a dynamic segment becomes "test", and a catch-all
 * becomes "a/b".
 */
function appPageRoutes(dir = join(__dirname, "app")): Array<{ file: string; path: string }> {
  const pages: Array<{ file: string; path: string }> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      // _folders are private and api/ holds route handlers, not pages.
      if (entry.name.startsWith("_") || relative(join(__dirname, "app"), full) === "api") continue
      pages.push(...appPageRoutes(full))
    } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
      const segments = relative(join(__dirname, "app"), dir).split(sep).filter(Boolean)
        .filter((segment) => !/^\(.*\)$/.test(segment) && !segment.startsWith("@"))
        .map((segment) => (/^\[\[?\.\.\./.test(segment) ? "a/b" : /^\[.*\]$/.test(segment) ? "test" : segment))
      pages.push({ file: relative(__dirname, full), path: "/" + segments.join("/") })
    }
  }
  return pages
}

describe("Content-Security-Policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("sends the strict policy by default, with one value per rule", async () => {
    const rules = await productionHeaders()
    const all = rules.find((rule) => rule.source === "/:path*")!
    const [strict] = cspOf(all)
    expect(strict).toContain("script-src 'self';")
    expect(strict).toContain("img-src 'self' data: blob: https:")
    // Fonts come from this site only, with no third-party font host.
    expect(strict).toContain("font-src 'self';")
    for (const rule of rules) expect(cspOf(rule).length).toBeLessThanOrEqual(1)
  })

  it("gives the React routes the same policy plus inline scripts, and no others", async () => {
    const rules = await productionHeaders()
    const { REACT_ROUTES } = await loadConfig()
    const [strict] = cspOf(rules.find((rule) => rule.source === "/:path*")!)
    const loose = rules.filter((rule) => cspOf(rule).some((value) => value.includes("script-src 'self' 'unsafe-inline'")))
    expect(loose.map((rule) => rule.source)).toEqual(REACT_ROUTES)
    // Listed after /:path*, so they replace its value rather than adding one.
    const allAt = rules.findIndex((rule) => rule.source === "/:path*")
    for (const rule of loose) {
      expect(rules.indexOf(rule)).toBeGreaterThan(allAt)
      expect(cspOf(rule)).toEqual([strict.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")])
    }
    // Matching on a file extension is what let /strains%2Ehtml through.
    for (const source of REACT_ROUTES) expect(source).not.toMatch(/html/)
  })

  it("covers every page under app/ with the React policy", async () => {
    const rules = await productionHeaders()
    const pages = appPageRoutes()
    expect(pages.map((page) => page.path)).toEqual(expect.arrayContaining(["/bag", "/account", "/register"]))
    const uncovered = pages.filter((page) => !policyFor(rules, page.path)?.includes("script-src 'self' 'unsafe-inline'"))
    expect(uncovered, `add these pages to REACT_ROUTES in next.config.mjs: ${uncovered.map((page) => page.file).join(", ")}`).toEqual([])
  })

  it("keeps the storefront strict however its path is written", async () => {
    const rules = await productionHeaders()
    for (const path of ["/", "/index.html", "/strains.html", "/strains%2Ehtml", "/strains%2ehtml", "/STRAINS.HTML", "/product.html", "/no-such-page", "/api/catalog"]) {
      expect(policyFor(rules, path), path).toContain("script-src 'self';")
    }
  })

  it("does not ask browsers to upgrade requests (WebKit applies it to http://localhost)", async () => {
    const rules = await productionHeaders()
    for (const rule of rules) for (const value of cspOf(rule)) expect(value).not.toContain("upgrade-insecure-requests")
  })
})
