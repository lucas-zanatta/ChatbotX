import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirstSpy = vi.fn<() => Promise<unknown>>()
const selectSpy = vi.fn<() => void>()
const limitSpy = vi.fn<() => Promise<unknown[]>>()
const updateSpy = vi.fn<(table: unknown) => void>()
const setSpy = vi.fn<(values: Record<string, unknown>) => void>()
const updWhereSpy = vi.fn<(where: unknown) => Promise<void>>()
const transactionImpl = vi.fn<(cb: (tx: unknown) => unknown) => unknown>()

const getContactInboxesSpy = vi.fn<() => Promise<Array<{ id: string }>>>()
const createDispatchSpy =
  vi.fn<
    (
      params: Record<string, unknown>,
    ) => Promise<{ id: string; bucket: number; runAtMs: string }>
  >()

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  asc: (column: unknown) => ({ __asc: column }),
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
  gt: (column: unknown, value: unknown) => ({ __gt: [column, value] }),
  db: {
    query: {
      contactsOnSequenceModel: {
        findFirst: findFirstSpy,
      },
    },
    select: () => {
      selectSpy()
      return {
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: limitSpy }),
          }),
        }),
      }
    },
    update: (table: unknown) => {
      updateSpy(table)
      return {
        set: (values: Record<string, unknown>) => {
          setSpy(values)
          return { where: updWhereSpy }
        },
      }
    },
    transaction: (cb: (tx: unknown) => unknown) => transactionImpl(cb),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnSequenceModel: {
    id: { __column: "id" },
    workspaceId: { __column: "workspaceId" },
  },
  sequenceStepModel: {
    sequenceId: { __column: "sequenceId" },
    order: { __column: "order" },
    isActive: { __column: "isActive" },
  },
}))

vi.mock("../src/contacts-on-sequences", () => ({
  getContactInboxes: getContactInboxesSpy,
}))

vi.mock("../src/dispatch-manager", () => ({
  createDispatch: createDispatchSpy,
}))

vi.mock("../src/calculate-next-run-at", () => ({
  calculateNextRunAtFromStep: () => new Date("2026-02-01T00:00:00Z"),
}))

vi.mock("../src/send-time-validator", () => ({
  calculateNextValidSendTime: () => new Date("2026-02-01T00:00:00Z"),
}))

const schedulerStub = { addToSchedule: vi.fn<() => Promise<void>>() }

const baseParams = () => ({
  contactId: "contact-1",
  currentStep: { id: "step-1", order: 1 },
  enrollmentId: "enrollment-1",
  scheduler: schedulerStub as never,
  sentAt: new Date("2026-01-01T00:00:00Z"),
  sequenceId: "sequence-1",
  workspaceId: "workspace-1",
})

beforeEach(() => {
  findFirstSpy.mockReset()
  selectSpy.mockClear()
  limitSpy.mockReset()
  limitSpy.mockResolvedValue([])
  updateSpy.mockClear()
  setSpy.mockClear()
  updWhereSpy.mockReset()
  updWhereSpy.mockResolvedValue(undefined)
  transactionImpl.mockReset()
  getContactInboxesSpy.mockReset()
  getContactInboxesSpy.mockResolvedValue([])
  createDispatchSpy.mockReset()
  createDispatchSpy.mockResolvedValue({
    id: "dispatch-1",
    bucket: 7,
    runAtMs: "999",
  })
  schedulerStub.addToSchedule.mockReset()
  schedulerStub.addToSchedule.mockResolvedValue(undefined)
})

describe("advanceEnrollment", () => {
  test("fetches enrollment scoped by id and workspaceId", async () => {
    const { advanceEnrollment } = await import("../src/advance-enrollment")
    // lastStepId === currentStep.id triggers the dedup guard → early return.
    findFirstSpy.mockResolvedValue({ status: "active", lastStepId: "step-1" })

    await advanceEnrollment(baseParams())

    expect(findFirstSpy).toHaveBeenCalledWith({
      where: { id: "enrollment-1", workspaceId: "workspace-1" },
    })
    expect(selectSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  test("returns early when enrollment is not active", async () => {
    const { advanceEnrollment } = await import("../src/advance-enrollment")
    findFirstSpy.mockResolvedValue({ status: "paused", lastStepId: null })

    await advanceEnrollment(baseParams())

    expect(selectSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  test("completes enrollment when there is no next step", async () => {
    const { advanceEnrollment } = await import("../src/advance-enrollment")
    findFirstSpy.mockResolvedValue({ status: "active", lastStepId: null })
    limitSpy.mockResolvedValue([])

    await advanceEnrollment(baseParams())

    expect(setSpy).toHaveBeenCalledTimes(1)
    const updateValues = setSpy.mock.calls[0][0]
    expect(updateValues.status).toBe("completed")
    expect(updWhereSpy).toHaveBeenCalledWith({
      __and: [
        { __eq: [{ __column: "id" }, "enrollment-1"] },
        { __eq: [{ __column: "workspaceId" }, "workspace-1"] },
      ],
    })
  })

  test("advances to next step and creates a dispatch", async () => {
    const { advanceEnrollment } = await import("../src/advance-enrollment")
    findFirstSpy.mockResolvedValue({ status: "active", lastStepId: null })
    limitSpy.mockResolvedValue([
      {
        id: "step-2",
        order: 2,
        delayDays: 0,
        delayMinutes: 0,
        delayUnit: null,
        specificDateTime: null,
        anytime: true,
        sendTimeStart: null,
        sendTimeEnd: null,
        sendDays: null,
      },
    ])

    const txSetSpy = vi.fn<(v: unknown) => unknown>()
    const txWhereSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    transactionImpl.mockImplementation(async (cb) =>
      cb({
        update: () => ({
          set: (values: unknown) => {
            txSetSpy(values)
            return { where: txWhereSpy }
          },
        }),
      }),
    )
    getContactInboxesSpy.mockResolvedValue([{ id: "ci-1" }])

    await advanceEnrollment(baseParams())

    expect(createDispatchSpy).toHaveBeenCalledTimes(1)
    const dispatchArgs = createDispatchSpy.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(dispatchArgs.workspaceId).toBe("workspace-1")
    expect(dispatchArgs.enrollmentId).toBe("enrollment-1")
    expect(dispatchArgs.stepId).toBe("step-2")
    expect(schedulerStub.addToSchedule).toHaveBeenCalledWith(
      7,
      "dispatch-1",
      999,
    )
  })
})
