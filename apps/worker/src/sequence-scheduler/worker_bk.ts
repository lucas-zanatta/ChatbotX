import { initializeDragonfly } from "@aha.chat/scheduler"
import { logger } from "../lib/logger"
import { getBootstrapJob } from "./bootstrap-job"
import { getDispatchConsumer } from "./dispatch-consumer"
import { getSchedulerWorker } from "./scheduler-worker"

/**
 * Main entry point for sequence scheduler system
 * Starts all components: scheduler worker, dispatch consumer, and bootstrap job
 */
export async function startSequenceScheduler(): Promise<void> {
  logger.info("Starting sequence scheduler system...")

  try {
    // Initialize Dragonfly connection
    await initializeDragonfly()
    logger.info("Dragonfly initialized")

    // Start scheduler worker (claims due dispatches and publishes to Kafka)
    const scheduler = getSchedulerWorker()
    await scheduler.start()
    logger.info("Scheduler worker started")

    // Start dispatch consumer (executes dispatches from Kafka)
    const consumer = getDispatchConsumer()
    await consumer.start()
    logger.info("Dispatch consumer started")

    // Start bootstrap job (reconciles DB state into Dragonfly)
    const bootstrap = getBootstrapJob()
    await bootstrap.start()
    logger.info("Bootstrap job started")

    logger.info("✅ Sequence scheduler system fully operational")
  } catch (error) {
    logger.error({ error }, "Failed to start sequence scheduler system")
    throw error
  }
}

/**
 * Stop all sequence scheduler components
 */
export async function stopSequenceScheduler(): Promise<void> {
  logger.info("Stopping sequence scheduler system...")

  try {
    const scheduler = getSchedulerWorker()
    await scheduler.stop()

    const consumer = getDispatchConsumer()
    await consumer.stop()

    const bootstrap = getBootstrapJob()
    await bootstrap.stop()

    logger.info("✅ Sequence scheduler system stopped")
  } catch (error) {
    logger.error({ error }, "Error stopping sequence scheduler system")
    throw error
  }
}

export * from "@aha.chat/sequence-scheduler"
export { getBootstrapJob } from "./bootstrap-job"
export { getDispatchConsumer } from "./dispatch-consumer"
export { getSchedulerWorker } from "./scheduler-worker"

startSequenceScheduler().catch((error) => {
  logger.error({ error }, "Fatal error in sequence scheduler")
  process.exit(1)
})

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down...")
  await stopSequenceScheduler()
  process.exit(0)
})

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down...")
  await stopSequenceScheduler()
  process.exit(0)
})
