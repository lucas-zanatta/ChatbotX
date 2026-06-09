import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirstSpy = vi.fn<() => Promise<unknown>>()
const insertSpy = vi.fn<(table: unknown) => unknown>()
const valuesSpy = vi.fn<(values: unknown) => unknown>()
const returningSpy = vi.fn<() => Promise<unknown[]>>()
const transactionImpl = vi.fn<(cb: (tx: unknown) => unknown) => unknown>()

const getContactInboxesSpy = vi.fn<() => Promise<Array<{ id: string }>>>()
const createDispatchSpy =
  vi.fn<() => Promise<{ id: string; bucket: number; runAtMs: string }>>()
const addToScheduleSpy = vi.fn<() => Promise<void>>()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (cb: (tx: unknown) => unknown) => transactionImpl(cb),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnSequenceModel: {
    id: { __column: "id" },
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  sequenceConnections: {
    useExisting: vi.fn(() => Promise.resolve({})),
  },
}))

vi.mock("@chatbotx.io/scheduler", () => ({
  SchedulerClient: class {
    addToSchedule = addToScheduleSpy
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "generated-id",
}))

vi.mock("../src/contacts-on-sequences", () => ({
  getContactInboxes: getContactInboxesSpy,
}))

vi.mock("../src/dispatch-manager", () => ({
  createDispatch: createDispatchSpy,
}))

const createClient = () => ({
  query: {
    contactsOnSequenceModel: {
      findFirst: findFirstSpy,
    },
  },
  insert: (table: unknown) => {
    insertSpy(table)
    return {
      values: (values: unknown) => {
        valuesSpy(values)
        return { returning: returningSpy }
      },
    }
  },
})

const baseParams = () => ({
  workspaceId: "workspace-1",
  contactId: "contact-1",
  sequenceId: "sequence-1",
  nextRunAt: new Date("2026-01-01T00:00:00Z"),
  nextStepId: "step-1" as string | null,
})

beforeEach(() => {
  findFirstSpy.mockReset()
  insertSpy.mockClear()
  valuesSpy.mockClear()
  returningSpy.mockReset()
  returningSpy.mockResolvedValue([{ id: "enrollment-1" }])
  transactionImpl.mockReset()
  getContactInboxesSpy.mockReset()
  getContactInboxesSpy.mockResolvedValue([])
  createDispatchSpy.mockReset()
  createDispatchSpy.mockResolvedValue({
    id: "dispatch-1",
    bucket: 3,
    runAtMs: "1000",
  })
  addToScheduleSpy.mockReset()
  addToScheduleSpy.mockResolvedValue(undefined)
})

describe("enrollContactInSequence", () => {
  test("is idempotent — existing enrollment skips insert and dispatch", async () => {
    const { enrollContactInSequence } = await import("../src/enroll-contact")
    findFirstSpy.mockResolvedValue({ id: "existing-enrollment" })

    await enrollContactInSequence({
      ...baseParams(),
      client: createClient() as never,
    })

    expect(valuesSpy).not.toHaveBeenCalled()
    expect(createDispatchSpy).not.toHaveBeenCalled()
  })

  test("inserts enrollment scoped to workspaceId", async () => {
    const { enrollContactInSequence } = await import("../src/enroll-contact")
    findFirstSpy.mockResolvedValue(undefined)
    getContactInboxesSpy.mockResolvedValue([])

    await enrollContactInSequence({
      ...baseParams(),
      client: createClient() as never,
    })

    expect(valuesSpy).toHaveBeenCalledTimes(1)
    const inserted = valuesSpy.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.workspaceId).toBe("workspace-1")
    expect(inserted.contactId).toBe("contact-1")
    expect(inserted.sequenceId).toBe("sequence-1")
    expect(inserted.status).toBe("active")
  })

  test("creates one dispatch per contact inbox", async () => {
    const { enrollContactInSequence } = await import("../src/enroll-contact")
    findFirstSpy.mockResolvedValue(undefined)
    getContactInboxesSpy.mockResolvedValue([{ id: "ci-1" }, { id: "ci-2" }])

    await enrollContactInSequence({
      ...baseParams(),
      client: createClient() as never,
    })

    expect(createDispatchSpy).toHaveBeenCalledTimes(2)
  })

  test("schedules each dispatch in Redis", async () => {
    const { enrollContactInSequence } = await import("../src/enroll-contact")
    findFirstSpy.mockResolvedValue(undefined)
    getContactInboxesSpy.mockResolvedValue([{ id: "ci-1" }, { id: "ci-2" }])

    await enrollContactInSequence({
      ...baseParams(),
      client: createClient() as never,
    })

    expect(addToScheduleSpy).toHaveBeenCalledTimes(2)
    expect(addToScheduleSpy).toHaveBeenCalledWith(3, "dispatch-1", 1000)
  })
})

describe("enrollContactsInSequenceBulk", () => {
  test("bulk insert is scoped to workspaceId and ignores conflicts", async () => {
    const { enrollContactsInSequenceBulk } = await import(
      "../src/enroll-contact"
    )

    const txConflictSpy = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined)
    const txValuesSpy = vi.fn(() => ({
      onConflictDoNothing: txConflictSpy,
    }))
    const txFindManySpy = vi
      .fn<() => Promise<unknown[]>>()
      .mockResolvedValue([])
    transactionImpl.mockImplementation(async (cb) =>
      cb({
        insert: () => ({ values: txValuesSpy }),
        query: {
          contactsOnSequenceModel: { findMany: txFindManySpy },
        },
      }),
    )

    await enrollContactsInSequenceBulk({
      workspaceId: "workspace-1",
      enrollments: [
        {
          contactId: "contact-1",
          sequenceId: "sequence-1",
          nextRunAt: new Date("2026-01-01T00:00:00Z"),
          nextStepId: null,
        },
      ],
    })

    expect(txValuesSpy).toHaveBeenCalledTimes(1)
    const rows = txValuesSpy.mock.calls[0][0] as Record<string, unknown>[]
    expect(rows[0].workspaceId).toBe("workspace-1")
    expect(rows[0].status).toBe("active")
    expect(txConflictSpy).toHaveBeenCalledTimes(1)
  })
})
