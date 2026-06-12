import { beforeEach, describe, expect, test, vi } from "vitest"

const findManySpy =
  vi.fn<(args: { where: Record<string, unknown> }) => Promise<unknown[]>>()
const updateWhereSpy = vi.fn<(arg: unknown) => Promise<unknown>>()
const removeFromScheduleSpy = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (c: unknown, v: unknown) => ({ __eq: [c, v] }),
  inArray: (c: unknown, v: unknown) => ({ __inArray: [c, v] }),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceDispatchModel: {
    id: { __column: "id" },
    workspaceId: { __column: "workspaceId" },
    status: { __column: "status" },
  },
}))
vi.mock("@chatbotx.io/redis", () => ({
  sequenceConnections: { useExisting: () => Promise.resolve({}) },
}))
vi.mock("@chatbotx.io/scheduler", () => ({
  SchedulerClient: class {
    removeFromSchedule = removeFromScheduleSpy
  },
}))

const cols = (where: {
  __and?: Array<{
    __eq?: [{ __column: string }, unknown]
    __inArray?: [{ __column: string }, unknown]
  }>
}) =>
  (where.__and ?? []).flatMap((condition) => {
    if (condition.__eq) {
      return [condition.__eq[0].__column]
    }

    if (condition.__inArray) {
      return [condition.__inArray[0].__column]
    }

    return []
  })

const client = {
  query: { sequenceDispatchModel: { findMany: findManySpy } },
  update: () => ({ set: () => ({ where: updateWhereSpy }) }),
} as never

beforeEach(() => {
  findManySpy.mockReset()
  updateWhereSpy.mockReset().mockResolvedValue(undefined)
  removeFromScheduleSpy.mockReset()
})

describe("cancelPendingDispatches", () => {
  test("GREEN SELECT filters enrollmentId + workspaceId + status=pending", async () => {
    findManySpy.mockResolvedValue([])
    const { cancelPendingDispatches } = await import("../src/dispatch-manager")

    await cancelPendingDispatches({
      enrollmentId: "e1",
      workspaceId: "w1",
      client,
    })

    const where = findManySpy.mock.calls[0][0].where
    expect(where).toMatchObject({
      enrollmentId: "e1",
      workspaceId: "w1",
      status: "pending",
    })
  })

  test("GREEN empty result skips UPDATE and Redis", async () => {
    findManySpy.mockResolvedValue([])
    const { cancelPendingDispatches } = await import("../src/dispatch-manager")

    const res = await cancelPendingDispatches({
      enrollmentId: "e1",
      workspaceId: "w1",
      client,
    })

    expect(res).toEqual([])
    expect(updateWhereSpy).not.toHaveBeenCalled()
    expect(removeFromScheduleSpy).not.toHaveBeenCalled()
  })

  test("GREEN UPDATE WHERE has id + workspaceId + status; Redis removed per dispatch", async () => {
    findManySpy.mockResolvedValue([
      { id: "d1", bucket: 1 },
      { id: "d2", bucket: 2 },
    ])
    const { cancelPendingDispatches } = await import("../src/dispatch-manager")

    await cancelPendingDispatches({
      enrollmentId: "e1",
      workspaceId: "w1",
      client,
    })

    const c = cols(updateWhereSpy.mock.calls[0][0] as { __and: [] })
    expect(c).toEqual(expect.arrayContaining(["id", "workspaceId", "status"]))
    expect(removeFromScheduleSpy).toHaveBeenCalledTimes(2)
  })
})
