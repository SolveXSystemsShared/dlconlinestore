import { beforeEach, describe, expect, it, vi } from "vitest"

const access = vi.hoisted(() => ({ value: { ageConfirmed: false, memberId: null as string | null } }))
const activeMemberFor = vi.hoisted(() => vi.fn())

vi.mock("@/lib/member-access", () => ({
  MEMBER_COOKIE: "dlc_member_access",
  getMemberAccess: async () => access.value,
}))
vi.mock("@/lib/member-session", () => ({ activeMemberFor }))

const { GET } = await import("./route")

describe("GET /api/members/session", () => {
  beforeEach(() => {
    activeMemberFor.mockReset()
  })

  it("names no member before age is confirmed, and leaves the member cookie alone", async () => {
    access.value = { ageConfirmed: false, memberId: "DLC-1234-56" }
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ageConfirmed: false, member: null })
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(activeMemberFor).not.toHaveBeenCalled()
  })

  it("returns the member once age is confirmed and the membership is active", async () => {
    access.value = { ageConfirmed: true, memberId: "DLC-1234-56" }
    activeMemberFor.mockResolvedValue({ memberId: "DLC-1234-56", name: "Test Member" })
    const response = await GET()
    expect(await response.json()).toEqual({ ageConfirmed: true, member: { memberId: "DLC-1234-56", name: "Test Member" } })
    expect(activeMemberFor).toHaveBeenCalledWith("DLC-1234-56")
  })

  it("returns no member when there is no member cookie", async () => {
    access.value = { ageConfirmed: true, memberId: null }
    const response = await GET()
    expect(await response.json()).toEqual({ ageConfirmed: true, member: null })
    expect(activeMemberFor).not.toHaveBeenCalled()
  })
})
