import { stepTypes } from "@chatbotx.io/flow-config"
import { describe, expect, it } from "vitest"
import type { TranslationFn } from "../../types"
import { performActionMenus } from "../menu"

const t = ((key: string) => key) as unknown as TranslationFn

describe("performActionMenus", () => {
  it("groups the MailChimp action under Email Actions", () => {
    const menus = performActionMenus(t)
    const emailActions = menus.find(
      (menu) => menu.label === "flows.actions.emailActions",
    )

    expect(
      emailActions?.children?.some(
        (menu) => menu.stepType === stepTypes.enum.mailchimpAddMember,
      ),
    ).toBe(true)
    expect(menus.map((menu) => menu.label)).not.toContain(
      "fields.mailchimp.label",
    )
  })
})
