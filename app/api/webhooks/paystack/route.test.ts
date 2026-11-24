import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const isPaystackSignature = vi.hoisted(() => vi.fn())
const completeSettlement = vi.hoisted(() => vi.fn())

vi.mock("@/lib/paystack", () => ({ isPaystackSignature }))
vi.mock("@/lib/settlement", () => ({ completeSettlement }))

const { POST } = await import("./route")

const webhook = (body: string) =>
  new NextRequest("http://localhost/api/webhooks/paystack", { method: "POST", body, headers: { "x-paystack-signature": "sig" } })

describe("POST /api/webhooks/paystack", () => {
  beforeEach(() => {
    isPaystackSignature.mockReset()
    completeSettlement.mockReset()
  })

  it("answers 400 for signed but unparseable JSON", async () => {
    isPaystackSignature.mockReturnValue(true)
    for (const body of ["{not json", "", "null", "42"]) {
      const response = await POST(webhook(body))
      expect(response.status).toBe(400)
    }
    expect(completeSettlement).not.toHaveBeenCalled()
  })

  it("checks the signature before parsing", async () => {
    isPaystackSignature.mockReturnValue(false)
    const response = await POST(webhook("{not json"))
    expect(response.status).toBe(401)
  })

  it("settles a signed charge.success", async () => {
    isPaystackSignature.mockReturnValue(true)
    completeSettlement.mockResolvedValue({ settled: true })
    const response = await POST(webhook(JSON.stringify({ event: "charge.success", data: { reference: "ref_123456" } })))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, settled: true })
    expect(completeSettlement).toHaveBeenCalledWith("ref_123456")
  })

  it("ignores other signed events", async () => {
    isPaystackSignature.mockReturnValue(true)
    const response = await POST(webhook(JSON.stringify({ event: "transfer.success" })))
    expect(await response.json()).toEqual({ ok: true, ignored: "transfer.success" })
  })
})
