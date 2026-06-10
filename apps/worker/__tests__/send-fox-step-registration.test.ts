import { stepTypes } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { createSendFoxContact } from "../src/integration/handlers/send-fox-handler"
import { flowStepHandlers } from "../src/integration/handlers/step"

describe("SendFox worker step registration", () => {
  test("registers the SendFox create-contact handler", () => {
    expect(flowStepHandlers[stepTypes.enum.sendFoxCreateContact]).toBe(
      createSendFoxContact,
    )
  })
})
