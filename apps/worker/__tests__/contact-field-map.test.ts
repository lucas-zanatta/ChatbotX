import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findByIdOrFail = vi.fn()
const listValues = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactService: { findByIdOrFail },
  contactCustomFieldService: { listValues },
}))

describe("getContactFieldMap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("maps system and custom contact fields", async () => {
    findByIdOrFail.mockResolvedValue({
      id: "contact-1",
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phoneNumber: null,
      avatar: null,
      locale: "en",
      gender: null,
      timezone: "UTC",
    })
    listValues.mockResolvedValue([{ customFieldId: "company", value: "Aha" }])

    const { getContactFieldMap } = await import(
      "../src/integration/handlers/contact-field-map"
    )
    const fields = await getContactFieldMap({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })

    expect(findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "contact-1",
    })
    expect(fields[systemFieldTypes.enum.first_name]).toBe("Ada")
    expect(fields[systemFieldTypes.enum.full_name]).toBe("Ada Lovelace")
    expect(fields.company).toBe("Aha")
  })
})
