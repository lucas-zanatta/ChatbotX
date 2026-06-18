import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { ConditionEvaluator } from "../src/trigger/services/condition-evaluator"

const workspace = {
  id: "workspace-1",
  timezone: "America/Sao_Paulo",
}

describe("ConditionEvaluator", () => {
  test.each(["link", "Link", "LINK"])(
    "matches Instagram comment contains condition case-insensitively for %s",
    async (text) => {
      const evaluator = new ConditionEvaluator()

      await expect(
        evaluator.evaluate({
          condition: {
            id: "condition-1",
            createdAt: new Date(),
            updatedAt: new Date(),
            triggerId: "trigger-1",
            webhookId: null,
            type: triggerEventTypes.enum.instagramCommentCreated,
            sourceId: null,
            operator: "contains",
            value: { text: "link" },
          },
          eventData: {
            workspaceId: "workspace-1",
            contactId: "contact-1",
            eventType: triggerEventTypes.enum.instagramCommentCreated,
            eventData: {
              text,
            },
            timestamp: new Date(),
          },
          workspaceId: "workspace-1",
          contactId: "contact-1",
          workspace,
        } as Parameters<ConditionEvaluator["evaluate"]>[0]),
      ).resolves.toBe(true)
    },
  )
})
