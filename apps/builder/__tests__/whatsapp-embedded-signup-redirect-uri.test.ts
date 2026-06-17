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

describe("getEmbeddedSignupRedirectUri", () => {
  test("points the redirect_uri at the broker host when configured", async () => {
    const { getEmbeddedSignupRedirectUri } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: BROKER_URL,
    })

    expect(getEmbeddedSignupRedirectUri()).toBe(
      `${BROKER_URL}/integrations/whatsapp/callback`,
    )
  })

  test("falls back to the builder host for single-domain deploys", async () => {
    const { getEmbeddedSignupRedirectUri } = await loadWith({
      NEXT_PUBLIC_BROKER_URL: undefined,
    })

    expect(getEmbeddedSignupRedirectUri()).toBe(
      `${BUILDER_URL}/integrations/whatsapp/callback`,
    )
  })
})
