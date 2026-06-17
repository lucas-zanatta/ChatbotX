// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest"

const sanitizeReferer = vi.fn()

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_BUILDER_URL: "https://app.example.com" },
}))
vi.mock("@/lib/oauth-referer", () => ({ sanitizeReferer }))
vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))
vi.mock("@chatbotx.io/utils", () => ({
  getPublicUrlFromRequest: (req: Request) => new URL(req.url),
}))

afterEach(() => {
  vi.clearAllMocks()
})

const { GET } = await import(
  "../src/app/integrations/whatsapp/embedded-signup/return/route"
)

test("relays the captured signup result back to an allowed reseller domain", async () => {
  sanitizeReferer.mockResolvedValueOnce("https://chat.reseller.com")
  const req = new Request(
    "https://broker.example.com/integrations/whatsapp/embedded-signup/return?callbackURL=https%3A%2F%2Fchat.reseller.com&workspaceId=123&waCode=abc&waba_id=w1&phone_number_id=p1&business_id=b1&transferPhoneNumber=true",
  )

  const res = await GET(req)
  const location = new URL(res.headers.get("location") ?? "")

  expect(res.status).toBe(307)
  expect(location.origin).toBe("https://chat.reseller.com")
  expect(location.pathname).toBe("/channels/create")
  expect(location.searchParams.get("channel")).toBe("whatsapp")
  expect(location.searchParams.get("waCode")).toBe("abc")
  expect(location.searchParams.get("waba_id")).toBe("w1")
  expect(location.searchParams.get("phone_number_id")).toBe("p1")
  expect(location.searchParams.get("business_id")).toBe("b1")
  expect(location.searchParams.get("workspaceId")).toBe("123")
  expect(location.searchParams.get("transferPhoneNumber")).toBe("true")
})

test("relays a cancel/error back to the reseller as waError", async () => {
  sanitizeReferer.mockResolvedValueOnce("https://chat.reseller.com")
  const req = new Request(
    "https://broker.example.com/integrations/whatsapp/embedded-signup/return?callbackURL=https%3A%2F%2Fchat.reseller.com&waError=1",
  )

  const res = await GET(req)
  const location = new URL(res.headers.get("location") ?? "")

  expect(location.origin).toBe("https://chat.reseller.com")
  expect(location.searchParams.get("waError")).toBe("1")
  expect(location.searchParams.get("waCode")).toBeNull()
})

test("open-redirect guard: never forwards to an attacker-supplied origin", async () => {
  // sanitizeReferer returns the safe in-app fallback path for disallowed origins.
  sanitizeReferer.mockResolvedValueOnce("/manage")
  const req = new Request(
    "https://broker.example.com/integrations/whatsapp/embedded-signup/return?callbackURL=https%3A%2F%2Fevil.com&waCode=abc",
  )

  const res = await GET(req)
  const location = new URL(res.headers.get("location") ?? "")

  expect(location.origin).toBe("https://broker.example.com")
  expect(location.pathname).toBe("/manage")
  expect(location.href).not.toContain("evil.com")
})
