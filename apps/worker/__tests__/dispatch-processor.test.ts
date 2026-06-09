import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirstSpy = vi.fn<() => Promise<unknown>>()
const updateSpy = vi.fn<(table: unknown) => unknown>()
const setSpy = vi.fn<(values: Record<string, unknown>) => unknown>()
const whereSpy = vi.fn<(where: unknown) => unknown>()
const returningSpy = vi.fn<() => Promise<unknown[]>>()

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  db: {
    query: {
      sequenceDispatchModel: {
        findFirst: findFirstSpy,
      },
    },
    update: (table: unknown) => {
      updateSpy(table)
      return {
        set: (values: Record<string, unknown>) => {
          setSpy(values)
          return {
            where: (where: unknown) => {
              whereSpy(where)
              return { returning: returningSpy }
            },
          }
        },
      }
    },
  },
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceDispatchModel: {
    id: { __column: "id" },
    workspaceId: { __column: "workspaceId" },
    status: { __column: "status" },
  },
}))

beforeEach(() => {
  findFirstSpy.mockReset()
  updateSpy.mockClear()
  setSpy.mockClear()
  whereSpy.mockClear()
  returningSpy.mockReset()
})

describe("DispatchProcessorService", () => {
  test("fetchDispatch looks up by id alone", async () => {
    const { DispatchProcessorService } = await import(
      "../src/sequence-scheduler/services/dispatch-processor.service"
    )
    const dispatch = { id: "dispatch-1", workspaceId: "workspace-1" }
    findFirstSpy.mockResolvedValue(dispatch)

    await new DispatchProcessorService().fetchDispatch("dispatch-1")

    expect(findFirstSpy).toHaveBeenCalledWith({
      where: { id: "dispatch-1" },
      with: {
        sequence: true,
        contact: true,
        enrollment: true,
      },
    })
  })

  test("lockDispatch includes id, workspaceId, and pending status filters", async () => {
    const { DispatchProcessorService } = await import(
      "../src/sequence-scheduler/services/dispatch-processor.service"
    )
    returningSpy.mockResolvedValue([{ id: "dispatch-1" }])

    const locked = await new DispatchProcessorService().lockDispatch({
      id: "dispatch-1",
      workspaceId: "workspace-1",
    } as never)

    expect(locked).toBe(true)
    expect(whereSpy).toHaveBeenCalledWith({
      __and: [
        { __eq: [{ __column: "id" }, "dispatch-1"] },
        { __eq: [{ __column: "workspaceId" }, "workspace-1"] },
        { __eq: [{ __column: "status" }, "pending"] },
      ],
    })
  })

  test("lockDispatch returns false when optimistic lock misses", async () => {
    const { DispatchProcessorService } = await import(
      "../src/sequence-scheduler/services/dispatch-processor.service"
    )
    returningSpy.mockResolvedValue([])

    const locked = await new DispatchProcessorService().lockDispatch({
      id: "dispatch-1",
      workspaceId: "workspace-1",
    } as never)

    expect(locked).toBe(false)
  })
})
