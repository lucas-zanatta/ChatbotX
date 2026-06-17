// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const BUILDER_URL = "https://app.example.com"
const BROKER_URL = "https://broker.example.com"

async function loadWith(envOverrides: Record<string, string | undefined>) {
  vi.resetModules()
  vi.doMock("@/env", () => ({
    env: {
      NEXT_PUBLIC_BUILDER_URL: BUILDER_URL,
      ...envOverrides,
    },
  }))
  return await import("@/features/integration-whatsapp/libs/embedded-signup")
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock("@/env")
})

describe("shouldRedirectToBroker", () => {
  test("redirects to the broker from a white-label custom domain", async () => {
    const { shouldRedirectToBroker } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    expect(shouldRedirectToBroker("chat.reseller.com")).toBe(true)
  })

  test("does not redirect when already on the broker host", async () => {
    const { shouldRedirectToBroker } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    expect(shouldRedirectToBroker("broker.example.com")).toBe(false)
  })

  test("does not redirect on single-domain deploys (no broker configured)", async () => {
    const { shouldRedirectToBroker } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: undefined,
    })

    expect(shouldRedirectToBroker("chat.reseller.com")).toBe(false)
  })
})

describe("buildBrokerEmbeddedSignupUrl", () => {
  test("builds the SDK page URL on the broker host with public config + flags", async () => {
    const { buildBrokerEmbeddedSignupUrl } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    const result = new URL(
      buildBrokerEmbeddedSignupUrl({
        callbackURL: "https://chat.reseller.com",
        workspaceId: "123",
        clientId: "client-1",
        configId: "config-1",
        version: "v21.0",
        connectExisting: false,
        transferPhoneNumber: true,
      }),
    )

    expect(result.origin).toBe(BROKER_URL)
    expect(result.pathname).toBe("/integrations/whatsapp/embedded-signup")
    expect(result.searchParams.get("callbackURL")).toBe(
      "https://chat.reseller.com",
    )
    expect(result.searchParams.get("workspaceId")).toBe("123")
    expect(result.searchParams.get("clientId")).toBe("client-1")
    expect(result.searchParams.get("configId")).toBe("config-1")
    expect(result.searchParams.get("transferPhoneNumber")).toBe("true")
  })

  test("omits workspaceId when not provided", async () => {
    const { buildBrokerEmbeddedSignupUrl } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    const result = new URL(
      buildBrokerEmbeddedSignupUrl({
        callbackURL: "https://chat.reseller.com",
        clientId: "client-1",
        configId: "config-1",
        version: "v21.0",
        connectExisting: true,
        transferPhoneNumber: false,
      }),
    )

    expect(result.searchParams.has("workspaceId")).toBe(false)
    expect(result.searchParams.get("connectExisting")).toBe("true")
  })
})
