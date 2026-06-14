import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  MessageShardConfigurationError,
  MessageShardUnavailableError,
} from "../src/errors"

const mocks = vi.hoisted(() => ({
  createShardRepository: vi.fn(),
  enableMessageSharding: false,
  loggerError: vi.fn(),
}))

vi.mock("../src/keys", () => ({
  keys: () => ({
    ENABLE_MESSAGE_SHARDING: mocks.enableMessageSharding,
  }),
}))

vi.mock("../src/logger", () => ({
  logger: {
    error: mocks.loggerError,
  },
}))

vi.mock("../src/sharding/message", () => ({
  createShardRepository: mocks.createShardRepository,
}))

import { MessageRepository } from "../src/repositories/message/message-repository"
import {
  createMessageRepository,
  getShardManager,
} from "../src/repositories/message/message-repository.factory"

describe("message repository factory", () => {
  beforeEach(() => {
    mocks.createShardRepository.mockReset()
    mocks.loggerError.mockReset()
    mocks.enableMessageSharding = false
  })

  test("returns the main repository when message sharding is disabled", async () => {
    const client = {} as never

    const repository = await createMessageRepository(client)

    expect(repository).toBeInstanceOf(MessageRepository)
    expect(mocks.createShardRepository).not.toHaveBeenCalled()
  })

  test("returns the sharded repository when message sharding is enabled", async () => {
    const client = {} as never
    const repository = { findAIContextMessages: vi.fn() }
    const manager = {
      invalidateShardingCache: vi.fn(),
      shutdown: vi.fn(),
    }
    mocks.enableMessageSharding = true
    mocks.createShardRepository.mockResolvedValue({ manager, repository })

    await expect(createMessageRepository(client)).resolves.toBe(repository)
    expect(getShardManager(client)).toBe(manager)
  })

  test("rejects configuration errors without falling back to main", async () => {
    const client = {} as never
    const error = new MessageShardConfigurationError("missing shards")
    mocks.enableMessageSharding = true
    mocks.createShardRepository.mockRejectedValue(error)

    await expect(createMessageRepository(client)).rejects.toBe(error)
  })

  test("wraps initialization errors without falling back to main", async () => {
    const client = {} as never
    mocks.enableMessageSharding = true
    mocks.createShardRepository.mockRejectedValue(new Error("connection down"))

    await expect(createMessageRepository(client)).rejects.toBeInstanceOf(
      MessageShardUnavailableError,
    )
  })

  test("retries shard initialization after a transient failure", async () => {
    const client = {} as never
    const repository = { findAIContextMessages: vi.fn() }
    const manager = {
      invalidateShardingCache: vi.fn(),
      shutdown: vi.fn(),
    }
    mocks.enableMessageSharding = true
    mocks.createShardRepository
      .mockRejectedValueOnce(new Error("connection down"))
      .mockResolvedValueOnce({ manager, repository })

    await expect(createMessageRepository(client)).rejects.toBeInstanceOf(
      MessageShardUnavailableError,
    )
    await expect(createMessageRepository(client)).resolves.toBe(repository)
  })
})
