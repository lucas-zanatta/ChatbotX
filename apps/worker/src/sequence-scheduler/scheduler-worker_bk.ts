import { getDragonflyClient } from "@aha.chat/scheduler"
import { Kafka, type Producer } from "kafkajs"
import { logger } from "../lib/logger"

const TOTAL_BUCKETS = 256
const CLAIM_LIMIT = 100
const LOCK_TTL_MS = 30_000
const TICK_INTERVAL_MS = 500

interface SchedulerConfig {
  buckets: number[]
  tickIntervalMs: number
  claimLimit: number
  lockTtlMs: number
}

export class SchedulerWorker {
  private readonly config: SchedulerConfig
  private readonly dragonfly = getDragonflyClient()
  private readonly kafka: Kafka
  private readonly producer: Producer
  private running = false
  private timers: NodeJS.Timeout[] = []

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = {
      buckets: config.buckets || this.getAssignedBuckets(),
      tickIntervalMs: config.tickIntervalMs || TICK_INTERVAL_MS,
      claimLimit: config.claimLimit || CLAIM_LIMIT,
      lockTtlMs: config.lockTtlMs || LOCK_TTL_MS,
    }

    const kafkaBrokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(
      ",",
    )

    // SASL authentication configuration
    const sasl =
      process.env.KAFKA_SASL_USERNAME && process.env.KAFKA_SASL_PASSWORD
        ? {
            mechanism: "plain" as const,
            username: process.env.KAFKA_SASL_USERNAME,
            password: process.env.KAFKA_SASL_PASSWORD,
          }
        : undefined

    this.kafka = new Kafka({
      clientId: "sequence-scheduler",
      brokers: kafkaBrokers,
      ssl: process.env.KAFKA_SSL_ENABLED === "true",
      sasl,
      retry: {
        retries: 5,
        initialRetryTime: 300,
        maxRetryTime: 30_000,
      },
    })

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30_000,
    })

    logger.info(
      {
        buckets: this.config.buckets,
        tickIntervalMs: this.config.tickIntervalMs,
      },
      "Scheduler worker initialized",
    )
  }

  /**
   * Get buckets assigned to this worker instance
   * Can be configured via env var for horizontal scaling
   */
  private getAssignedBuckets(): number[] {
    const bucketRange = process.env.SCHEDULER_BUCKET_RANGE

    if (bucketRange) {
      // Format: "0-63" or "0,1,2,3"
      if (bucketRange.includes("-")) {
        const [start, end] = bucketRange.split("-").map(Number)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
      }
      return bucketRange.split(",").map(Number)
    }

    // Default: assign all buckets (single instance)
    return Array.from({ length: TOTAL_BUCKETS }, (_, i) => i)
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn("Scheduler worker already running")
      return
    }

    logger.info("Starting scheduler worker...")

    // Connect to Dragonfly
    await this.dragonfly.connect()

    // Connect Kafka producer
    await this.producer.connect()

    this.running = true

    // Start scheduler loop for each bucket
    for (const bucket of this.config.buckets) {
      this.startBucketScheduler(bucket)
    }

    logger.info(
      { bucketCount: this.config.buckets.length },
      "Scheduler worker started",
    )
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return
    }

    logger.info("Stopping scheduler worker...")

    this.running = false

    // Clear all timers
    for (const timer of this.timers) {
      clearTimeout(timer)
    }
    this.timers = []

    // Disconnect
    await this.producer.disconnect()
    await this.dragonfly.disconnect()

    logger.info("Scheduler worker stopped")
  }

  private startBucketScheduler(bucket: number): void {
    const tick = async () => {
      if (!this.running) {
        return
      }

      try {
        await this.processBucket(bucket)
      } catch (error) {
        logger.error({ error, bucket }, "Error processing bucket in scheduler")
      }

      // Schedule next tick
      if (this.running) {
        const timer = setTimeout(tick, this.config.tickIntervalMs)
        this.timers.push(timer)
      }
    }

    // Start first tick
    tick()
  }

  private async processBucket(bucket: number): Promise<void> {
    const nowMs = Date.now()

    // Claim from schedule ZSET
    const scheduleKey = this.dragonfly.getScheduleKey(bucket)
    const scheduleClaimed = await this.dragonfly.claimDue(
      scheduleKey,
      nowMs,
      this.config.claimLimit,
      this.config.lockTtlMs,
    )

    // Claim from retry ZSET
    const retryKey = this.dragonfly.getRetryKey(bucket)
    const retryClaimed = await this.dragonfly.claimDue(
      retryKey,
      nowMs,
      this.config.claimLimit,
      this.config.lockTtlMs,
    )

    const allClaimed = [...scheduleClaimed, ...retryClaimed]

    if (allClaimed.length > 0) {
      logger.debug(
        {
          bucket,
          scheduleClaimed: scheduleClaimed.length,
          retryClaimed: retryClaimed.length,
        },
        "Claimed dispatches",
      )

      // Publish to Kafka
      await this.publishDispatches(allClaimed)
    }
  }

  private async publishDispatches(dispatchIds: string[]): Promise<void> {
    const messages = dispatchIds.map((dispatchId) => ({
      key: dispatchId,
      value: JSON.stringify({
        dispatchId,
        claimedAt: Date.now(),
      }),
    }))

    await this.producer.send({
      topic: "seq.dispatch.run",
      messages,
    })

    logger.debug({ count: dispatchIds.length }, "Published dispatches to Kafka")
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<{
    running: boolean
    buckets: number[]
    stats: Record<number, { schedule: number; retry: number }>
  }> {
    const stats: Record<number, { schedule: number; retry: number }> = {}

    for (const bucket of this.config.buckets) {
      const schedule = await this.dragonfly.getScheduleCount(bucket)
      const retry = await this.dragonfly.getRetryCount(bucket)
      stats[bucket] = { schedule, retry }
    }

    return {
      running: this.running,
      buckets: this.config.buckets,
      stats,
    }
  }
}

// Singleton instance
let schedulerWorker: SchedulerWorker | null = null

export function getSchedulerWorker(): SchedulerWorker {
  if (!schedulerWorker) {
    schedulerWorker = new SchedulerWorker()
  }
  return schedulerWorker
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down scheduler worker...")
  if (schedulerWorker) {
    await schedulerWorker.stop()
  }
  process.exit(0)
})

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down scheduler worker...")
  if (schedulerWorker) {
    await schedulerWorker.stop()
  }
  process.exit(0)
})
