import { type DatabaseClient, db } from "../../client"
import { MessageShardConfigurationError } from "../../errors"
import type {
  DistributedLock,
  IMessageRepository,
} from "../../repositories/message/message-repository"
import { MessageShardConnectionManager } from "./connection-manager"
import { MessageShardRegistry } from "./registry"
import { ShardedMessageRepository } from "./repository"

export * from "./client"
export * from "./connection-manager"
export * from "./registry"
export * from "./schema"
export * from "./shard-migration-runner"
export * from "./shard-schema"

export type CreateShardRepositoryResult = {
  manager: MessageShardConnectionManager
  repository: IMessageRepository
}

export async function createShardRepository(
  client: DatabaseClient = db,
  distributedLock?: DistributedLock,
): Promise<CreateShardRepositoryResult> {
  const registry = new MessageShardRegistry(client)
  const shardCount = await registry.countShards()

  if (shardCount === 0) {
    throw new MessageShardConfigurationError(
      "Message sharding is enabled but no message shards are configured.",
    )
  }

  const manager = new MessageShardConnectionManager(client, registry)

  return {
    manager,
    repository: new ShardedMessageRepository(manager, distributedLock),
  }
}
