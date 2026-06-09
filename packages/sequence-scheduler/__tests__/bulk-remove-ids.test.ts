import { beforeEach, describe, expect, test, vi } from "vitest"

const findManySpy = vi.fn<() => Promise<unknown[]>>()
const deleteSpy = vi.fn<(table: unknown) => unknown>()
const whereSpy = vi.fn<(where: unknown) => Promise<void>>()
const cancelPendingDispatchesSpy = vi.fn<() => Promise<unknown[]>>()

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  db: {},
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnSequenceModel: {
    id: { __column: "id" },
    workspaceId: { __column: "workspaceId" },
  },
}))

vi.mock("../src/dispatch-manager", () => ({
  cancelPendingDispatches: (params: unknown) =>
    cancelPendingDispatchesSpy(params),
}))

const createDbClient = () => ({
  query: {
    contactsOnSequenceModel: {
      findMany: findManySpy,
    },
  },
  delete: (table: unknown) => {
    deleteSpy(table)
    return {
      where: (where: unknown) => whereSpy(where),
    }
  },
})

beforeEach(() => {
  findManySpy.mockReset()
  deleteSpy.mockClear()
  whereSpy.mockClear()
  cancelPendingDispatchesSpy.mockReset()
  cancelPendingDispatchesSpy.mockResolvedValue([])
})

describe("contactsOnSequencesUtils.bulkRemoveIds", () => {
  test("empty sequenceIds short-circuits without DB calls", async () => {
    const { contactsOnSequencesUtils } = await import(
      "../src/contacts-on-sequences"
    )
    const dbClient = createDbClient()

    await contactsOnSequencesUtils.bulkRemoveIds(
      dbClient as never,
      "contact-1",
      [],
    )

    expect(findManySpy).not.toHaveBeenCalled()
    expect(cancelPendingDispatchesSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test("no matching enrollments short-circuits after SELECT", async () => {
    const { contactsOnSequencesUtils } = await import(
      "../src/contacts-on-sequences"
    )
    const dbClient = createDbClient()
    findManySpy.mockResolvedValue([])

    await contactsOnSequencesUtils.bulkRemoveIds(
      dbClient as never,
      "contact-1",
      ["sequence-1"],
    )

    expect(findManySpy).toHaveBeenCalledTimes(1)
    expect(cancelPendingDispatchesSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test("cancels pending dispatches before deleting enrollments", async () => {
    const { contactsOnSequencesUtils } = await import(
      "../src/contacts-on-sequences"
    )
    const dbClient = createDbClient()
    findManySpy.mockResolvedValue([
      { id: "enrollment-1", workspaceId: "workspace-1" },
    ])

    await contactsOnSequencesUtils.bulkRemoveIds(
      dbClient as never,
      "contact-1",
      ["sequence-1"],
    )

    expect(cancelPendingDispatchesSpy).toHaveBeenCalledBefore(deleteSpy)
  })

  test("deletes each enrollment with id and workspaceId filters", async () => {
    const { contactsOnSequencesUtils } = await import(
      "../src/contacts-on-sequences"
    )
    const dbClient = createDbClient()
    findManySpy.mockResolvedValue([
      { id: "enrollment-1", workspaceId: "workspace-1" },
      { id: "enrollment-2", workspaceId: "workspace-2" },
    ])

    await contactsOnSequencesUtils.bulkRemoveIds(
      dbClient as never,
      "contact-1",
      ["sequence-1", "sequence-2"],
    )

    expect(whereSpy).toHaveBeenCalledTimes(2)
    expect(whereSpy.mock.calls[0][0]).toEqual({
      __and: [
        { __eq: [{ __column: "id" }, "enrollment-1"] },
        { __eq: [{ __column: "workspaceId" }, "workspace-1"] },
      ],
    })
    expect(whereSpy.mock.calls[1][0]).toEqual({
      __and: [
        { __eq: [{ __column: "id" }, "enrollment-2"] },
        { __eq: [{ __column: "workspaceId" }, "workspace-2"] },
      ],
    })
  })
})
