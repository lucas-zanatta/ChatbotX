import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ShardConfig } from "../src/sharding/shared"

const shardMocks = vi.hoisted(() => ({
  createMessageShardClient: vi.fn(),
  createReadShardPool: vi.fn(),
  createShardPool: vi.fn(),
}))

vi.mock("../src/sharding/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/sharding/shared")>()
  return {
    ...actual,
    createReadShardPool: shardMocks.createReadShardPool,
    createShardPool: shardMocks.createShardPool,
  }
})

vi.mock("../src/sharding/message/client", () => ({
  createMessageShardClient: shardMocks.createMessageShardClient,
}))

import { MessageShardConnectionManager } from "../src/sharding/message/connection-manager"

// ---------------------------------------------------------------------------
// getWriteShardInfo — exposes the workspace's write shard as an all-time
// time-range info so read paths can union it in. This guarantees back-dated
// historical-import rows (written into the active shard but outside its
// registered time-range) remain reachable on read.
// ---------------------------------------------------------------------------

const shardRecord = {
  id: "s1",
  name: "shard-1",
  host: "localhost",
  port: 5432,
  database: "shard_db",
  user: "shard_user",
  credentialRef: null,
  isActive: true,
  sslMode: "disable",
  shardKey: null,
  readHost: null,
  readPort: null,
}

function makePool(id: string, query = vi.fn().mockResolvedValue([{ ok: 1 }])) {
  return {
    end: vi.fn().mockResolvedValue(undefined),
    idleCount: 0,
    id,
    query,
    totalCount: 0,
    waitingCount: 0,
  }
}

function makeManager(
  registryOverrides: Record<string, unknown> = {},
): MessageShardConnectionManager {
  const registry = {
    countActiveShards: vi.fn().mockResolvedValue(1),
    findShardForWrite: vi.fn().mockResolvedValue(shardRecord),
    ...registryOverrides,
  }
  return new MessageShardConnectionManager({} as never, registry as never)
}

describe("MessageShardConnectionManager.getWriteShardInfo", () => {
  beforeEach(() => {
    shardMocks.createMessageShardClient.mockReset()
    shardMocks.createReadShardPool.mockReset()
    shardMocks.createShardPool.mockReset()
    shardMocks.createMessageShardClient.mockImplementation(
      (pool: { id: string }) => ({ clientId: pool.id }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("maps the workspace write shard to an all-time time-range info", async () => {
    const manager = makeManager()

    const info = await manager.getWriteShardInfo("ws-1")

    expect(info).not.toBeNull()
    expect(info?.shardId).toBe("s1")
    expect(info?.id).toBe("write:s1")
    expect(info?.startTime).toEqual(new Date(0))
    expect(info?.endTime).toBeNull()
    expect(info?.shard.id).toBe("s1")
  })

  test("returns null when sharding is disabled (no active shards)", async () => {
    const manager = makeManager({
      countActiveShards: vi.fn().mockResolvedValue(0),
    })

    const info = await manager.getWriteShardInfo("ws-1")

    expect(info).toBeNull()
  })

  test("returns null when no shard is assigned to the workspace", async () => {
    const manager = makeManager({
      findShardForWrite: vi.fn().mockResolvedValue(null),
    })

    const info = await manager.getWriteShardInfo("ws-1")

    expect(info).toBeNull()
  })
})

describe("MessageShardConnectionManager.getShardClientForRead", () => {
  beforeEach(() => {
    shardMocks.createMessageShardClient.mockReset()
    shardMocks.createReadShardPool.mockReset()
    shardMocks.createShardPool.mockReset()
    shardMocks.createMessageShardClient.mockImplementation(
      (pool: { id: string }) => ({ clientId: pool.id }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("retries an unhealthy read replica after the retry TTL", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

    const shard = {
      ...shardRecord,
      readHost: "replica",
      readPort: 5432,
    } satisfies ShardConfig
    const primaryPool = makePool("primary")
    const failingReadPool = makePool(
      "read-fail",
      vi.fn().mockRejectedValue(new Error("replica down")),
    )
    const recoveredReadPool = makePool("read-ok")
    const manager = makeManager()

    shardMocks.createShardPool.mockReturnValue(primaryPool)
    shardMocks.createReadShardPool
      .mockReturnValueOnce(failingReadPool)
      .mockReturnValueOnce(recoveredReadPool)

    const writeClient = await manager.getShardClient(shard)
    const readClientBeforeTtl = await manager.getShardClientForRead(shard)

    expect(writeClient).toEqual({ clientId: "primary" })
    expect(readClientBeforeTtl).toEqual({ clientId: "primary" })
    expect(shardMocks.createReadShardPool).toHaveBeenCalledTimes(1)
    expect(failingReadPool.end).toHaveBeenCalled()

    vi.setSystemTime(new Date("2026-01-01T00:01:01.000Z"))

    const readClientAfterTtl = await manager.getShardClientForRead(shard)

    expect(readClientAfterTtl).toEqual({ clientId: "read-ok" })
    expect(shardMocks.createReadShardPool).toHaveBeenCalledTimes(2)
    expect(recoveredReadPool.query).toHaveBeenCalledWith("SELECT 1")
  })
})
