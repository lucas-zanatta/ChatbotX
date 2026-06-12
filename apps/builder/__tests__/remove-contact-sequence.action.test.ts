// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockCancelPendingDispatches,
  mockDelete,
  mockDeleteWhere,
  mockFindMany,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere })

  return {
    mockCancelPendingDispatches: vi.fn().mockResolvedValue(undefined),
    mockDelete,
    mockDeleteWhere,
    mockFindMany: vi.fn(),
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  db: {
    delete: mockDelete,
    query: {
      contactsOnSequenceModel: {
        findMany: mockFindMany,
      },
    },
  },
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
  inArray: (column: unknown, value: unknown) => ({
    __inArray: [column, value],
  }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnSequenceModel: {
    id: { __column: "id" },
    workspaceId: { __column: "workspaceId" },
  },
}))

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  cancelPendingDispatches: mockCancelPendingDispatches,
}))

const { removeContactSequenceAction } = await import(
  "../src/features/contacts/actions/remove-contact-sequence.action"
)

type ActionHandler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { ids: string[]; sequences: string[] }
}) => Promise<unknown>

const callAction = removeContactSequenceAction as unknown as ActionHandler
const WORKSPACE_ID = "ws-1"

const columnsInAnd = (where: {
  __and?: Array<{ __eq?: [{ __column: string }, unknown] }>
}) =>
  (where.__and ?? [])
    .filter((condition) => condition.__eq)
    .map((condition) => condition.__eq?.[0].__column)

describe("removeContactSequenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCancelPendingDispatches.mockResolvedValue(undefined)
    mockDelete.mockReturnValue({ where: mockDeleteWhere })
    mockDeleteWhere.mockResolvedValue(undefined)
    mockFindMany.mockResolvedValue([
      { id: "enrollment-1" },
      { id: "enrollment-2" },
    ])
  })

  test("cancels pending dispatches before deleting enrollments", async () => {
    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ids: ["contact-1"], sequences: ["sequence-1"] },
    })

    expect(mockCancelPendingDispatches).toHaveBeenCalledTimes(2)
    expect(mockDeleteWhere).toHaveBeenCalledOnce()

    const firstCancelOrder =
      mockCancelPendingDispatches.mock.invocationCallOrder[0] ?? -1
    const deleteOrder = mockDeleteWhere.mock.invocationCallOrder[0] ?? -1
    expect(firstCancelOrder).toBeLessThan(deleteOrder)
  })

  test("deletes enrollments with workspaceId in the WHERE clause", async () => {
    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ids: ["contact-1"], sequences: ["sequence-1"] },
    })

    const where = mockDeleteWhere.mock.calls[0]?.[0] as {
      __and?: Array<{ __eq?: [{ __column: string }, unknown] }>
    }
    expect(columnsInAnd(where)).toContain("workspaceId")
  })

  test("skips delete when no enrollments match", async () => {
    mockFindMany.mockResolvedValue([])

    await callAction({
      bindArgsParsedInputs: [WORKSPACE_ID],
      parsedInput: { ids: ["contact-1"], sequences: ["sequence-1"] },
    })

    expect(mockCancelPendingDispatches).not.toHaveBeenCalled()
    expect(mockDeleteWhere).not.toHaveBeenCalled()
  })
})
