import { type DatabaseClient, db } from "../../client"
import {
  MessageShardConfigurationError,
  MessageShardUnavailableError,
} from "../../errors"
import { keys } from "../../keys"
import { logger } from "../../logger"
import { createShardRepository } from "../../sharding/message"
import {
  type DistributedLock,
  type IMessageRepository,
  MessageRepository,
} from "./message-repository"

interface RepositoryCacheEntry {
  distributedLock?: DistributedLock
  promise: Promise<IMessageRepository>
}

export interface ShardManagerLike {
  invalidateShardingCache(): void
  shutdown(): Promise<void>
}

const repositoryCache = new WeakMap<DatabaseClient, RepositoryCacheEntry>()
const shardManagerCache = new WeakMap<DatabaseClient, ShardManagerLike>()

async function buildRepository(
  client: DatabaseClient,
  distributedLock?: DistributedLock,
): Promise<IMessageRepository> {
  const env = keys()

  if (!env.ENABLE_MESSAGE_SHARDING) {
    return new MessageRepository(client)
  }

  try {
    const result = await createShardRepository(client, distributedLock)
    shardManagerCache.set(client, result.manager)
    return result.repository
  } catch (error) {
    if (error instanceof MessageShardConfigurationError) {
      logger.error({ err: error }, "Message sharding initialization failed")
      throw error
    }
    const shardError = new MessageShardUnavailableError(
      "Message sharding initialization failed",
    )
    logger.error({ err: shardError }, "Message sharding initialization failed")
    throw shardError
  }
}

export function createMessageRepository(
  client: DatabaseClient = db,
  distributedLock?: DistributedLock,
): Promise<IMessageRepository> {
  const cached = repositoryCache.get(client)
  if (cached && cached.distributedLock === distributedLock) {
    return cached.promise
  }

  const promise = buildRepository(client, distributedLock)
  repositoryCache.set(client, { promise, distributedLock })
  promise.catch(() => {
    if (repositoryCache.get(client)?.promise === promise) {
      repositoryCache.delete(client)
    }
  })
  return promise
}

export function getShardManager(
  client: DatabaseClient = db,
): ShardManagerLike | null {
  return shardManagerCache.get(client) ?? null
}

export function invalidateRepositoryCache(client: DatabaseClient = db): void {
  repositoryCache.delete(client)
  const manager = shardManagerCache.get(client)
  if (manager) {
    manager.invalidateShardingCache()
  }
}

export async function shutdownShardConnections(
  client: DatabaseClient = db,
): Promise<void> {
  const manager = shardManagerCache.get(client)
  if (manager) {
    await manager.shutdown()
    shardManagerCache.delete(client)
  }
  repositoryCache.delete(client)
}
