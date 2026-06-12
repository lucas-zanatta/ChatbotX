// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  cancelPendingDispatchesSpy,
  deleteSpy,
  deleteWhereSpy,
  enrollContactInSequenceSpy,
  findByIdOrFailSpy,
  findManySpy,
  selectRowsQueue,
} = vi.hoisted(() => {
  const selectRowsQueue: unknown[][] = []
  const deleteWhereSpy = vi.fn().mockResolvedValue(undefined)

  return {
    cancelPendingDispatchesSpy: vi.fn().mockResolvedValue(undefined),
    deleteSpy: vi.fn().mockReturnValue({ where: deleteWhereSpy }),
    deleteWhereSpy,
    enrollContactInSequenceSpy: vi.fn().mockResolvedValue(undefined),
    findByIdOrFailSpy: vi.fn(),
    findManySpy: vi.fn().mockResolvedValue([]),
    selectRowsQueue,
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  contactService: {
    findByIdOrFail: findByIdOrFailSpy,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  db: {
    delete: deleteSpy,
    query: {
      contactsOnSequenceModel: {
        findMany: findManySpy,
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => selectRowsQueue.shift() ?? []),
      })),
    })),
  },
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
  inArray: (column: unknown, value: unknown) => ({
    __inArray: [column, value],
  }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnSequenceModel: {
    contactId: { __column: "contactId" },
    id: { __column: "id" },
    sequenceId: { __column: "sequenceId" },
    workspaceId: { __column: "workspaceId" },
  },
}))

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  cancelPendingDispatches: cancelPendingDispatchesSpy,
  enrollContactInSequence: enrollContactInSequenceSpy,
}))

vi.mock("../src/features/contact-sequences/schema", () => ({
  updateContactSequenceRequest: {},
}))

vi.mock(
  "../src/features/contact-sequences/utils/calculate-next-run-at",
  () => ({
    calculateNextRunAtBulk: vi.fn().mockResolvedValue(new Map()),
  }),
)

const { updateContactSequenceAction } = await import(
  "../src/features/contact-sequences/actions/update-contact-sequence.action"
)

type ActionHandler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { contactId: string; sequences: string[] }
}) => Promise<unknown>

const callAction = updateContactSequenceAction as unknown as ActionHandler
const WORKSPACE_ID = "ws-1"

const columnsInAnd = (where: {
  __and?: Array<{ __eq?: [{ __column: string }, unknown] }>
}) =>
  (where.__and ?? [])
    .filter((condition) => condition.__eq)
    .map((condition) => condition.__eq?.[0].__column)

describe("updateContactSequenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectRowsQueue.length = 0
    cancelPendingDispatchesSpy.mockResolvedValue(undefined)
    deleteSpy.mockReturnValue({ where: deleteWhereSpy })
    deleteWhereSpy.mockResolvedValue(undefined)
    enrollContactInSequenceSpy.mockResolvedValue(undefined)
    findByIdOrFailSpy.mockResolvedValue({ id: "contact-1" })
    findManySpy.mockResolvedValue([])
  })

  test("cancels pending dispatches before deleting removed enrollments", async () => {
    selectRowsQueue.push(
      [{ sequenceId: "sequence-1" }, { sequenceId: "sequence-2" }],
      [{ id: "enrollment-1", workspaceId: WORKSPACE_ID }],
    )

    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { contactId: "contact-1", sequences: ["sequence-2"] },
    })

    expect(cancelPendingDispatchesSpy).toHaveBeenCalledWith({
      client: expect.any(Object),
      enrollmentId: "enrollment-1",
      reason: "enrollment_removed",
      workspaceId: WORKSPACE_ID,
    })
    expect(deleteWhereSpy).toHaveBeenCalledOnce()

    const cancelOrder =
      cancelPendingDispatchesSpy.mock.invocationCallOrder[0] ?? -1
    const deleteOrder = deleteWhereSpy.mock.invocationCallOrder[0] ?? -1
    expect(cancelOrder).toBeLessThan(deleteOrder)
  })

  test("deletes each removed enrollment with id and workspaceId", async () => {
    selectRowsQueue.push(
      [{ sequenceId: "sequence-1" }, { sequenceId: "sequence-2" }],
      [
        { id: "enrollment-1", workspaceId: WORKSPACE_ID },
        { id: "enrollment-2", workspaceId: WORKSPACE_ID },
      ],
    )

    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { contactId: "contact-1", sequences: ["sequence-2"] },
    })

    expect(deleteWhereSpy).toHaveBeenCalledTimes(2)
    for (const call of deleteWhereSpy.mock.calls) {
      expect(
        columnsInAnd(
          call[0] as {
            __and?: Array<{ __eq?: [{ __column: string }, unknown] }>
          },
        ),
      ).toEqual(expect.arrayContaining(["id", "workspaceId"]))
    }
  })
})
