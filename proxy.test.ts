import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match"
import { REACT_CSP, STRICT_CSP } from "./lib/csp"
import { config, proxy } from "./proxy"

function post(path: string, headers: Record<string, string> = {}, method = "POST") {
  return new NextRequest(`http://localhost${path}`, { method, headers: { origin: "http://localhost", ...headers } })
}

/** NextResponse.next() marks the request as passed on rather than answered. */
const passedOn = (response: Response) => response.headers.get("x-middleware-next") === "1"

describe("proxy body size", () => {
  it("refuses a Content-Length over the limit", () => {
    expect(proxy(post("/api/cart", { "content-length": String(64 * 1024 + 1) })).status).toBe(413)
  })

  it("gives registration 1 MB", () => {
    expect(passedOn(proxy(post("/api/members/register", { "content-length": String(1024 * 1024) })))).toBe(true)
    expect(proxy(post("/api/members/register", { "content-length": String(1024 * 1024 + 1) })).status).toBe(413)
  })

  it("refuses a Content-Length that is not a whole number", () => {
    for (const value of ["abc", "1.5", "-1", "1e9", "10, 10"]) {
      expect(proxy(post("/api/cart", { "content-length": value })).status).toBe(400)
    }
  })

  it("lets a request without Content-Length through to the route", () => {
    expect(passedOn(proxy(post("/api/wishlist", {}, "DELETE")))).toBe(true)
    expect(passedOn(proxy(post("/api/cart")))).toBe(true)
  })
})

describe("proxy Content-Security-Policy", () => {
  const FILES = ["/index.html", "/strains.html", "/product.html", "/assets/dlc-logo.svg"]
  const get = (path: string) => new NextRequest(`http://localhost${path}`)

  async function load(files: string[] | null) {
    vi.resetModules()
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DLC_PUBLIC_FILES", files ? JSON.stringify(files) : undefined)
    return (await import("./proxy")).proxy
  }
  const policy = (response: Response) => response.headers.get("content-security-policy")

  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.unstubAllEnvs() })

  it.each([
    "/", "/index.html", "/strains.html", "/strains%2Ehtml", "/strains%2ehtml", "/%73trains.html", "//strains.html",
    "/strains.html/", "/%E0%A4", "/api/members/session",
  ])("is strict for %s", async (path) => {
    const response = (await load(FILES))(get(path))
    expect(policy(response)).toBe(STRICT_CSP)
    expect(passedOn(response)).toBe(true)
  })

  it.each(["/no-such-page", "/no-such.html", "/bag", "/account", "/register", "/exchange/x", "/settings/fulfilment"])("is the React policy for %s", async (path) => {
    const response = (await load(FILES))(get(path))
    expect(policy(response)).toBe(REACT_CSP)
    expect(passedOn(response)).toBe(true)
  })

  it("falls back to strict, bar the React pages, when the list is missing or empty", async () => {
    for (const files of [null, []]) {
      const run = await load(files)
      for (const path of ["/", "/strains.html", "/strains%2Ehtml", "/no-such-page"]) expect(policy(run(get(path))), path).toBe(STRICT_CSP)
      for (const path of ["/bag", "/account", "/register", "/exchange/x"]) expect(policy(run(get(path))), path).toBe(REACT_CSP)
    }
  })

  it("is on the API answers the proxy gives itself, too", async () => {
    const run = await load(FILES)
    const refused = run(post("/api/cart", { origin: "https://evil.example" }))
    expect(refused.status).toBe(403)
    expect(policy(refused)).toBe(STRICT_CSP)
    expect(policy(run(post("/api/cart", { "content-length": String(64 * 1024 + 1) })))).toBe(STRICT_CSP)
  })

  it("leaves the API checks to the API: a page is never refused for its Origin", async () => {
    const run = await load(FILES)
    expect(passedOn(run(post("/bag", { origin: "https://evil.example" })))).toBe(true)
    expect(run(post("/%61pi/cart", { origin: "https://evil.example" })).status).toBe(403)
  })

  it("is not sent in development", () => {
    expect(policy(proxy(get("/")))).toBeNull()
  })

  it("runs for every path except the files Next built and its image route", () => {
    const matches = getPathMatch(config.matcher)
    for (const path of ["/", "/strains.html", "/bag", "/api/cart", "/favicon.ico", "/no/such/page", "/_next/imagex", "/_next/data/x.json"]) expect(matches(path), path).toBeTruthy()
    for (const path of ["/_next/static/chunks/a.js", "/_next/image"]) expect(matches(path), path).toBe(false)
  })
})
