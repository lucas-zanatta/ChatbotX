import { beforeEach, describe, expect, test, vi } from "vitest"

const findManySpy = vi.fn<() => Promise<unknown[]>>()
const updateSpy = vi.fn<(table: unknown) => unknown>()
const setSpy = vi.fn<(values: Record<string, unknown>) => unknown>()
const whereSpy = vi.fn<(where: unknown) => Promise<void>>()
const removeFromScheduleSpy = vi.fn<() => Promise<void>>()

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  db: {},
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
  inArray: (column: unknown, values: unknown[]) => ({
    __inArray: [column, values],
  }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceDispatchModel: {
    id: { __column: "id" },
    workspaceId: { __column: "workspaceId" },
    status: { __column: "status" },
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  sequenceConnections: {
    useExisting: vi.fn(() => Promise.resolve({})),
  },
}))

vi.mock("@chatbotx.io/scheduler", () => ({
  SchedulerClient: class {
    removeFromSchedule = removeFromScheduleSpy
  },
}))

const createDbClient = () => ({
  query: {
    sequenceDispatchModel: {
      findMany: findManySpy,
    },
  },
  update: (table: unknown) => {
    updateSpy(table)
    return {
      set: (values: Record<string, unknown>) => {
        setSpy(values)
        return {
          where: (where: unknown) => whereSpy(where),
        }
      },
    }
  },
})

beforeEach(() => {
  findManySpy.mockReset()
  updateSpy.mockClear()
  setSpy.mockClear()
  whereSpy.mockClear()
  removeFromScheduleSpy.mockReset()
  removeFromScheduleSpy.mockResolvedValue(undefined)
})

describe("cancelPendingDispatches", () => {
  test("select filters include enrollmentId and workspaceId", async () => {
    const { cancelPendingDispatches } = await import("../src/dispatch-manager")
    const dbClient = createDbClient()
    findManySpy.mockResolvedValue([])

    await cancelPendingDispatches({
      client: dbClient as never,
      enrollmentId: "enrollment-1",
      workspaceId: "workspace-1",
    })

    expect(findManySpy).toHaveBeenCalledWith({
      where: {
        enrollmentId: "enrollment-1",
        workspaceId: "workspace-1",
        status: "pending",
      },
      columns: {
        id: true,
        bucket: true,
        sequenceId: true,
        contactId: true,
        stepId: true,
      },
    })
  })

  test("empty result returns [] without update or Redis calls", async () => {
    const { cancelPendingDispatches } = await import("../src/dispatch-manager")
    const dbClient = createDbClient()
    findManySpy.mockResolvedValue([])

    const result = await cancelPendingDispatches({
      client: dbClient as never,
      enrollmentId: "enrollment-1",
      workspaceId: "workspace-1",
    })

    expect(result).toEqual([])
    expect(updateSpy).not.toHaveBeenCalled()
    expect(removeFromScheduleSpy).not.toHaveBeenCalled()
  })

  test("update includes id list, workspaceId, and pending status filters", async () => {
    const { cancelPendingDispatches } = await import("../src/dispatch-manager")
    const dbClient = createDbClient()
    findManySpy.mockResolvedValue([
      { id: "dispatch-1", bucket: 1 },
      { id: "dispatch-2", bucket: 2 },
    ])

    await cancelPendingDispatches({
      client: dbClient as never,
      enrollmentId: "enrollment-1",
      workspaceId: "workspace-1",
    })

    expect(whereSpy).toHaveBeenCalledWith({
      __and: [
        {
          __inArray: [{ __column: "id" }, ["dispatch-1", "dispatch-2"]],
        },
        { __eq: [{ __column: "workspaceId" }, "workspace-1"] },
        { __eq: [{ __column: "status" }, "pending"] },
      ],
    })
  })

  test("removes each canceled dispatch from Redis schedule", async () => {
    const { cancelPendingDispatches } = await import("../src/dispatch-manager")
    const dbClient = createDbClient()
    findManySpy.mockResolvedValue([
      { id: "dispatch-1", bucket: 1 },
      { id: "dispatch-2", bucket: 2 },
    ])

    await cancelPendingDispatches({
      client: dbClient as never,
      enrollmentId: "enrollment-1",
      workspaceId: "workspace-1",
    })

    expect(removeFromScheduleSpy).toHaveBeenCalledTimes(2)
    expect(removeFromScheduleSpy).toHaveBeenNthCalledWith(1, 1, "dispatch-1")
    expect(removeFromScheduleSpy).toHaveBeenNthCalledWith(2, 2, "dispatch-2")
  })
})
