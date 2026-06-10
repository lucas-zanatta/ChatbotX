import { describe, expect, test } from "vitest"
import {
  actionSteps,
  sendFoxCreateContactDefaultFn,
  sendFoxCreateContactSchema,
  stateTypes,
  stepTypes,
} from "../src"

describe("sendFoxCreateContactSchema", () => {
  test("creates defaults with optional list and state routing", () => {
    const value = sendFoxCreateContactDefaultFn()
    expect(value.stepType).toBe(stepTypes.enum.sendFoxCreateContact)
    expect(value.listId).toBeUndefined()
    expect(value.emailField).toBe("email")
    expect(value.states.map((state) => state.stateType)).toEqual([
      stateTypes.success,
      stateTypes.error,
    ])
    expect(sendFoxCreateContactSchema.parse(value)).toEqual(value)
  })

  test.each([
    "",
    "abc",
    "0",
    "-1",
    "9007199254740992",
  ])("rejects invalid list ID %s", (listId) => {
    expect(() =>
      sendFoxCreateContactSchema.parse({
        ...sendFoxCreateContactDefaultFn(),
        listId,
      }),
    ).toThrow()
  })

  test("is registered in the action step union", () => {
    const value = { ...sendFoxCreateContactDefaultFn(), listId: "12" }
    expect(actionSteps.some((schema) => schema.safeParse(value).success)).toBe(
      true,
    )
  })
})
