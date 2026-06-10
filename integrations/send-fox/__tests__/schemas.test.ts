import { AuthType } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import {
  createSendFoxAuth,
  sendFoxCreateContactPayloadSchema,
  sendFoxListsResponseSchema,
} from "../src"

describe("SendFox schemas", () => {
  test("normalizes custom PAT auth", () => {
    expect(createSendFoxAuth("  token  ")).toEqual({
      authType: AuthType.custom,
      accessToken: "token",
    })
  })

  test("validates numeric list IDs from the provider", () => {
    expect(
      sendFoxListsResponseSchema.parse({
        data: [{ id: 42, name: "Customers" }],
      }),
    ).toEqual({ data: [{ id: 42, name: "Customers" }] })
    expect(() =>
      sendFoxListsResponseSchema.parse({ data: [{ id: 0, name: "Invalid" }] }),
    ).toThrow()
  })

  test("allows contact payloads without optional names and list", () => {
    expect(
      sendFoxCreateContactPayloadSchema.parse({ email: "user@example.com" }),
    ).toEqual({ email: "user@example.com" })
  })
})
