import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { mailerLiteAddSubscriberDefaultFn } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { buildMailerLiteSubscriberProps } from "../src/integration/handlers/mailer-lite-handler"

describe("MailerLite subscriber payload", () => {
  test("normalizes email, applies explicit mapping precedence, and omits empty values", () => {
    const step = {
      ...mailerLiteAddSubscriberDefaultFn(),
      groupId: "group-1",
      status: "active" as const,
      mergeFields: [
        { contactFieldId: "plan-field", mailerLiteField: "plan" },
        { contactFieldId: "empty-field", mailerLiteField: "empty" },
        { contactFieldId: "unsafe-field", mailerLiteField: "phone" },
      ],
    }
    expect(
      buildMailerLiteSubscriberProps(
        {
          [systemFieldTypes.enum.email]: " Person@Example.com ",
          [systemFieldTypes.enum.first_name]: "Ada",
          [systemFieldTypes.enum.last_name]: "Lovelace",
          [systemFieldTypes.enum.phone]: "123",
          "plan-field": " Pro ",
          "empty-field": " ",
          "unsafe-field": "unsafe",
        },
        step,
      ),
    ).toEqual({
      email: "person@example.com",
      status: "active",
      groups: ["group-1"],
      fields: {
        name: "Ada",
        last_name: "Lovelace",
        phone: "unsafe",
        plan: "Pro",
      },
    })
  })

  test("omits group and fields and rejects an empty email", () => {
    const step = mailerLiteAddSubscriberDefaultFn()
    expect(() => buildMailerLiteSubscriberProps({}, step)).toThrow(
      "MailerLite subscriber email is empty",
    )
    expect(
      buildMailerLiteSubscriberProps(
        { [systemFieldTypes.enum.email]: "a@example.com" },
        step,
      ),
    ).toEqual({
      email: "a@example.com",
      status: "unconfirmed",
    })
  })
})
