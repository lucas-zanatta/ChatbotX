import { prisma } from "@aha.chat/database"
import { getDragonflyClient } from "@aha.chat/scheduler"
import { logger } from "../lib/logger"

const BOOTSTRAP_WINDOW_HOURS = 24
const BATCH_SIZE = 1000

export class BootstrapJob {
  private readonly dragonfly = getDragonflyClient()
  private running = false
  private intervalId: NodeJS.Timeout | null = null
  private readonly intervalMs: number

  constructor(intervalMs = 3_600_000) {
    this.intervalMs = intervalMs
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn("Bootstrap job already running")
      return
    }

    logger.info(
      { intervalMs: this.intervalMs },
      "Starting bootstrap/reconciliation job",
    )

    // Run immediately on start
    await this.reconcile()

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      this.reconcile().catch((error) => {
        logger.error({ error }, "Error in bootstrap job")
      })
    }, this.intervalMs)

    this.running = true
    logger.info("Bootstrap job started")
  }

  stop(): void {
    if (!this.running) {
      return
    }

    logger.info("Stopping bootstrap job...")
    this.running = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    logger.info("Bootstrap job stopped")
  }

  /**
   * Reconcile pending dispatches into Dragonfly
   * Recovers from Dragonfly restarts and missed ZADDs
   */
  async reconcile(): Promise<void> {
    const startTime = Date.now()
    logger.info("Starting reconciliation...")

    try {
      const windowEnd = new Date()
      windowEnd.setHours(windowEnd.getHours() + BOOTSTRAP_WINDOW_HOURS)

      let totalReconciled = 0
      let offset = 0
      let hasMore = true

      while (hasMore) {
        // Query pending dispatches in batches
        const windowEndMs = BigInt(windowEnd.getTime())

        const dispatches = await prisma.sequenceDispatch.findMany({
          where: {
            status: "pending",
            runAtMs: {
              lte: windowEndMs,
            },
          },
          select: {
            id: true,
            bucket: true,
            runAtMs: true,
            chatbotId: true,
            contactId: true,
          },
          orderBy: { runAtMs: "asc" },
          skip: offset,
          take: BATCH_SIZE,
        })

        if (dispatches.length === 0) {
          hasMore = false
          break
        }

        // Add each dispatch to schedule
        for (const d of dispatches) {
          await this.dragonfly.addToSchedule(d.bucket, d.id, Number(d.runAtMs))
        }

        totalReconciled += dispatches.length
        offset += BATCH_SIZE

        logger.debug(
          { batch: dispatches.length, total: totalReconciled },
          "Reconciled batch",
        )

        // Check if we got less than batch size (last batch)
        if (dispatches.length < BATCH_SIZE) {
          hasMore = false
        }
      }

      const duration = Date.now() - startTime
      logger.info(
        { totalReconciled, duration, windowHours: BOOTSTRAP_WINDOW_HOURS },
        "Reconciliation completed",
      )

      // Record metrics
      await this.recordReconciliationMetrics(totalReconciled, duration)
    } catch (error) {
      logger.error({ error }, "Error during reconciliation")
      throw error
    }
  }

  /**
   * Clean up orphaned entries in Dragonfly
   * Remove dispatch IDs that no longer exist or are not pending in DB
   */
  async cleanupOrphans(): Promise<void> {
    logger.info("Starting orphan cleanup...")

    try {
      const bucketStats: Record<number, { removed: number }> = {}

      // Check each bucket (this is expensive, run less frequently)
      for (let bucket = 0; bucket < 256; bucket++) {
        // Get all dispatch IDs in this bucket's ZSETs
        const scheduleIds = await this.getZSetMembers(bucket, "schedule")
        const retryIds = await this.getZSetMembers(bucket, "retry")

        const allIds = [...new Set([...scheduleIds, ...retryIds])]

        if (allIds.length === 0) {
          continue
        }

        // Check which IDs exist and are pending in DB
        const validDispatches = await prisma.sequenceDispatch.findMany({
          where: {
            id: { in: allIds },
            status: "pending",
          },
          select: { id: true },
        })

        const validIds = new Set(validDispatches.map((d) => d.id))
        const orphanIds = allIds.filter((id) => !validIds.has(id))

        if (orphanIds.length > 0) {
          // Remove orphans
          for (const id of orphanIds) {
            await this.dragonfly.removeFromSchedule(bucket, id)
          }

          bucketStats[bucket] = { removed: orphanIds.length }

          logger.debug(
            { bucket, removed: orphanIds.length },
            "Cleaned up orphans in bucket",
          )
        }
      }

      const totalRemoved = Object.values(bucketStats).reduce(
        (sum, stat) => sum + stat.removed,
        0,
      )

      logger.info(
        { totalRemoved, buckets: Object.keys(bucketStats).length },
        "Orphan cleanup completed",
      )
    } catch (error) {
      logger.error({ error }, "Error during orphan cleanup")
      throw error
    }
  }

  /**
   * Get all members from a ZSET
   * Note: In production, use ZSCAN for large sets
   */
  private async getZSetMembers(
    bucket: number,
    type: "schedule" | "retry",
  ): Promise<string[]> {
    try {
      return await this.dragonfly.getZSetMembers(bucket, type)
    } catch (error) {
      logger.error({ error, bucket, type }, "Error getting ZSET members")
      return []
    }
  }

  private recordReconciliationMetrics(count: number, duration: number): void {
    // TODO: Send metrics to your monitoring system
    // e.g., Prometheus, Datadog, CloudWatch, etc.
    logger.debug(
      {
        metric: "sequence_scheduler_reconciliation",
        count,
        duration,
      },
      "Reconciliation metrics",
    )
  }

  /**
   * Get health status
   */
  getHealth(): {
    running: boolean
    lastRun: Date | null
  } {
    return {
      running: this.running,
      lastRun: null,
    }
  }
}

// Singleton instance
let bootstrapJob: BootstrapJob | null = null

export function getBootstrapJob(): BootstrapJob {
  if (!bootstrapJob) {
    const intervalMs = Number.parseInt(
      process.env.BOOTSTRAP_INTERVAL_MS || "3600000",
      10,
    )
    bootstrapJob = new BootstrapJob(intervalMs)
  }
  return bootstrapJob
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down bootstrap job...")
  if (bootstrapJob) {
    await bootstrapJob.stop()
  }
})

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down bootstrap job...")
  if (bootstrapJob) {
    await bootstrapJob.stop()
  }
})
