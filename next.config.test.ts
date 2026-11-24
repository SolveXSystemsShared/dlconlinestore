import { existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants"
import { cspFor, publicFileSet, STRICT_CSP } from "./lib/csp"

type Config = {
  headers(): Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>
  env: { DLC_PUBLIC_FILES: string }
  experimental: { proxyClientMaxBodySize: number }
}

async function loadConfig() {
  // @ts-expect-error -- the config is plain JavaScript with no declaration file.
  return (await import("./next.config.mjs")) as { default(phase: string): Config }
}

const config = async (phase = PHASE_PRODUCTION_BUILD) => (await loadConfig()).default(phase)

describe("proxy body buffering", () => {
  it("stops a full 1 MB past the largest route cap, so a cut-off body is still too large", async () => {
    const { MAX_BODY, MAX_REGISTRATION_BODY } = await import("./lib/request-body")
    const limit = (await config()).experimental.proxyClientMaxBodySize
    expect(limit).toBe(2 * 1024 * 1024)
    // Next drops the chunk that crosses the limit; Node reads sockets in
    // chunks of at most 64 KB, far less than this margin.
    expect(limit - MAX_REGISTRATION_BODY).toBeGreaterThanOrEqual(MAX_REGISTRATION_BODY)
    expect(limit).toBeGreaterThan(MAX_BODY)
  })
})

describe("the list of public files", () => {
  afterEach(() => {
    vi.doUnmock("node:fs")
    vi.resetModules()
  })

  it("is not empty, and holds only the URL paths of files in public/", async () => {
    const files: string[] = JSON.parse((await config()).env.DLC_PUBLIC_FILES)
    expect(files.length).toBeGreaterThan(20)
    for (const file of files) {
      expect(file).toMatch(/^\/[^/]/)
      expect(file).not.toContain("..")
      const full = join(__dirname, "public", file)
      expect(existsSync(full) && statSync(full).isFile(), file).toBe(true)
    }
    expect(files).toEqual(expect.arrayContaining(["/index.html", "/strains.html", "/product.html", "/store.js", "/assets/dlc-logo.svg"]))
  })

  it("puts every page in public/ on the strict policy", async () => {
    const json = (await config()).env.DLC_PUBLIC_FILES
    const files = publicFileSet(json)
    const pages = (JSON.parse(json) as string[]).filter((file) => file.endsWith(".html"))
    expect(pages.length).toBeGreaterThanOrEqual(9)
    for (const page of pages) expect(cspFor(page, files), page).toBe(STRICT_CSP)
  })

  it("stops the build, but not a running server, when public/ cannot be listed", async () => {
    vi.resetModules()
    vi.doMock("node:fs", () => ({ readdirSync: () => { throw new Error("ENOENT") } }))
    const { default: make } = await loadConfig()
    expect(() => make(PHASE_PRODUCTION_BUILD)).toThrow("public/ could not be listed")
    expect(make(PHASE_PRODUCTION_SERVER).env.DLC_PUBLIC_FILES).toBe("[]")
  })
})

describe("headers()", () => {
  it("leaves the Content-Security-Policy to the proxy, so no response carries two", async () => {
    const rules = await (await config()).headers()
    expect(rules.flatMap((rule) => rule.headers.map((header) => header.key))).not.toContain("Content-Security-Policy")
  })

  it("still sends the other security headers everywhere", async () => {
    const rules = await (await config()).headers()
    expect(rules.find((rule) => rule.source === "/:path*")!.headers.map((header) => header.key)).toEqual([
      "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy", "Strict-Transport-Security",
      "Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy", "X-Permitted-Cross-Domain-Policies",
    ])
  })
})
