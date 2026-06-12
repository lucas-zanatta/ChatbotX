import { beforeEach, describe, expect, test, vi } from "vitest"

const findManySpy = vi.fn<(args: unknown) => Promise<unknown[]>>()
const deleteWhereSpy = vi.fn<(arg: unknown) => Promise<unknown>>()
const cancelSpy = vi.fn<(p: unknown) => Promise<unknown[]>>()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (c: unknown, v: unknown) => ({ __eq: [c, v] }),
  inArray: (c: unknown, v: unknown) => ({ __inArray: [c, v] }),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnSequenceModel: {
    id: { __column: "id" },
    workspaceId: { __column: "workspaceId" },
  },
}))
vi.mock("../src/dispatch-manager", () => ({
  cancelPendingDispatches: cancelSpy,
}))

const cols = (where: {
  __and?: Array<{ __eq?: [{ __column: string }, unknown] }>
}) =>
  (where.__and ?? []).flatMap((condition) =>
    condition.__eq ? [condition.__eq[0].__column] : [],
  )

const dbClient = {
  query: { contactsOnSequenceModel: { findMany: findManySpy } },
  delete: () => ({ where: deleteWhereSpy }),
} as never

beforeEach(() => {
  findManySpy.mockReset()
  deleteWhereSpy.mockReset().mockResolvedValue(undefined)
  cancelSpy.mockReset().mockResolvedValue([])
})

describe("bulkRemoveIds", () => {
  test("GREEN empty sequenceIds short-circuits", async () => {
    const { contactsOnSequencesUtils } = await import(
      "../src/contacts-on-sequences"
    )

    await contactsOnSequencesUtils.bulkRemoveIds(dbClient, "c1", [])

    expect(findManySpy).not.toHaveBeenCalled()
    expect(deleteWhereSpy).not.toHaveBeenCalled()
  })

  test("GREEN no matching enrollments short-circuits", async () => {
    findManySpy.mockResolvedValue([])
    const { contactsOnSequencesUtils } = await import(
      "../src/contacts-on-sequences"
    )

    await contactsOnSequencesUtils.bulkRemoveIds(dbClient, "c1", ["s1"])

    expect(cancelSpy).not.toHaveBeenCalled()
    expect(deleteWhereSpy).not.toHaveBeenCalled()
  })

  test("GREEN cancels pending dispatches before deleting", async () => {
    findManySpy.mockResolvedValue([{ id: "e1", workspaceId: "w1" }])
    const order: string[] = []
    cancelSpy.mockImplementation(() => {
      order.push("cancel")
      return Promise.resolve([])
    })
    deleteWhereSpy.mockImplementation(() => {
      order.push("delete")
      return Promise.resolve(undefined)
    })
    const { contactsOnSequencesUtils } = await import(
      "../src/contacts-on-sequences"
    )

    await contactsOnSequencesUtils.bulkRemoveIds(dbClient, "c1", ["s1"])

    expect(order[0]).toBe("cancel")
    expect(order).toContain("delete")
  })

  // RED -> Phase 2: delete must be per-enrollment with id + workspaceId (partition key).
  test("RED delete WHERE includes workspaceId, one delete per enrollment", async () => {
    findManySpy.mockResolvedValue([
      { id: "e1", workspaceId: "w1" },
      { id: "e2", workspaceId: "w1" },
    ])
    const { contactsOnSequencesUtils } = await import(
      "../src/contacts-on-sequences"
    )

    await contactsOnSequencesUtils.bulkRemoveIds(dbClient, "c1", ["s1"])

    expect(deleteWhereSpy).toHaveBeenCalledTimes(2)
    for (const call of deleteWhereSpy.mock.calls) {
      const c = cols(call[0] as { __and: [] })
      expect(c).toContain("id")
      expect(c).toContain("workspaceId")
    }
  })
})
