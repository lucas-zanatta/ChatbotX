import { type Prisma, prisma } from "@aha.chat/database"
import { getDragonflyClient } from "@aha.chat/scheduler"
import { createDispatch } from "@aha.chat/sequence-scheduler"
import { type Consumer, Kafka } from "kafkajs"
import { logger } from "../lib/logger"

const MAX_RETRY_ATTEMPTS = 3
const BASE_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 300_000 // 5 minutes

type DispatchMessage = {
  dispatchId: string
  claimedAt: number
}

type DispatchWithRelations = Prisma.SequenceDispatchGetPayload<{
  include: {
    sequence: true
    contact: true
    enrollment: true
  }
}>

type StepWithRelations = Prisma.SequenceStepGetPayload<{
  include: { flow: true }
}>

export class DispatchConsumer {
  private readonly kafka: Kafka
  private readonly consumer: Consumer
  private readonly dragonfly = getDragonflyClient()
  private running = false

  constructor() {
    const kafkaBrokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(
      ",",
    )
    const groupId =
      process.env.KAFKA_CONSUMER_GROUP || "sequence-dispatch-consumer"

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
      clientId: "sequence-dispatch-consumer",
      brokers: kafkaBrokers,
      ssl: process.env.KAFKA_SSL_ENABLED === "true",
      sasl,
      retry: {
        retries: 5,
        initialRetryTime: 300,
        maxRetryTime: 30_000,
      },
    })

    this.consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30_000,
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 100,
    })

    logger.info({ groupId }, "Dispatch consumer initialized")
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn("Dispatch consumer already running")
      return
    }

    logger.info("Starting dispatch consumer...")

    await this.consumer.connect()
    await this.consumer.subscribe({
      topic: "seq.dispatch.run",
      fromBeginning: false,
    })

    await this.consumer.run({
      autoCommit: true,
      eachMessage: async ({ message }: EachMessagePayload) => {
        try {
          const payload = JSON.parse(
            message.value?.toString() || "{}",
          ) as DispatchMessage

          await this.processDispatch(payload.dispatchId)
        } catch (error) {
          logger.error({ error, message }, "Error processing dispatch message")
        }
      },
    })

    this.running = true
    logger.info("Dispatch consumer started")
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return
    }

    logger.info("Stopping dispatch consumer...")
    this.running = false

    await this.consumer.disconnect()
    logger.info("Dispatch consumer stopped")
  }

  private async processDispatch(dispatchId: string): Promise<void> {
    const startTime = Date.now()

    try {
      // Load dispatch
      const dispatch = (await prisma.sequenceDispatch.findUnique({
        where: { id: dispatchId },
        include: {
          sequence: true,
          contact: true,
          enrollment: true,
        },
      })) as DispatchWithRelations | null

      if (!dispatch) {
        logger.warn({ dispatchId }, "Dispatch not found")
        return
      }

      // Guard: Check status
      if (dispatch.status !== "pending") {
        logger.debug(
          { dispatchId, status: dispatch.status },
          "Dispatch not pending, skipping",
        )
        return
      }

      // Guard: Check if too early (safety check)
      const nowMs = Date.now()
      const runAtMs = dispatch.runAt.getTime()
      if (runAtMs > nowMs + 1000) {
        logger.warn(
          { dispatchId, runAtMs, nowMs },
          "Dispatch scheduled in future, re-enqueueing",
        )
        await this.dragonfly.addToSchedule(
          (dispatch as any).bucket,
          dispatchId,
          runAtMs,
        )
        return
      }

      // Mark as running with optimistic lock
      const updated = await prisma.sequenceDispatch.updateMany({
        where: {
          id: dispatchId,
          chatbotId: dispatch.chatbotId,
          status: "pending",
        },
        data: {
          status: "running",
          lockedAt: new Date(),
          lockOwner: process.env.HOSTNAME || "unknown",
          updatedAt: new Date(),
        },
      })

      if (updated.count === 0) {
        logger.debug(
          { dispatchId },
          "Failed to acquire dispatch lock, already taken",
        )
        return
      }

      // Execute the step
      await this.executeStep(dispatch)

      const duration = Date.now() - startTime
      logger.info(
        { dispatchId, duration, contactId: dispatch.contactId },
        "Dispatch completed successfully",
      )
    } catch (error) {
      logger.error({ error, dispatchId }, "Error processing dispatch")

      // Release lock on error
      try {
        await this.dragonfly.releaseLock(dispatchId)
      } catch (lockError) {
        logger.error({ lockError, dispatchId }, "Error releasing lock")
      }
    }
  }

  private async executeStep(dispatch: DispatchWithRelations): Promise<void> {
    try {
      // Get the step details
      const step = (await prisma.sequenceStep.findUnique({
        where: { id: dispatch.stepId },
        include: { flow: true },
      })) as StepWithRelations | null

      if (!step) {
        throw new Error(`Step ${dispatch.stepId} not found`)
      }

      if (!step.flow) {
        throw new Error(`Step ${dispatch.stepId} has no flow configured`)
      }

      // TODO: Execute the flow/send message
      // This would integrate with your existing flow execution system
      // For now, we'll simulate success
      logger.info(
        {
          dispatchId: dispatch.id,
          stepId: step.id,
          flowId: step.flowId,
          contactId: dispatch.contactId,
        },
        "Executing step flow",
      )

      // Simulate sending (replace with actual flow execution)
      await this.simulateFlowExecution(dispatch, step)

      // Mark dispatch as completed
      await prisma.sequenceDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      })

      // Record event
      await prisma.sequenceEvent.create({
        data: {
          chatbotId: dispatch.chatbotId,
          sequenceId: dispatch.sequenceId,
          contactId: dispatch.contactId,
          stepId: dispatch.stepId,
          dispatchId: dispatch.id,
          eventType: "dispatch_completed",
          payload: {
            attempt: dispatch.attempt,
            duration: Date.now() - dispatch.runAt.getTime(),
          },
          occurredAt: new Date(),
        },
      })

      // Advance enrollment to next step
      await this.advanceEnrollment(dispatch, step)

      // Release lock
      await this.dragonfly.releaseLock(dispatch.id)
    } catch (error) {
      await this.handleExecutionError(dispatch, error)
    }
  }

  private async simulateFlowExecution(
    _dispatch: DispatchWithRelations,
    _step: StepWithRelations,
  ): Promise<void> {
    // TODO: Replace with actual flow execution
    // This should trigger your existing flow system
    // await sendFlowNode({ flowId: step.flowId, contactId: dispatch.contactId, ... })

    // For now, just wait a bit to simulate work
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  private async advanceEnrollment(
    dispatch: DispatchWithRelations,
    step: StepWithRelations,
  ): Promise<void> {
    // Get next active step
    const nextStep = (await prisma.sequenceStep.findFirst({
      where: {
        sequenceId: dispatch.sequenceId,
        order: { gt: step.order },
        isActive: true,
      },
      orderBy: { order: "asc" },
      include: { flow: true },
    })) as StepWithRelations | null

    if (!nextStep) {
      // No more steps, mark enrollment as completed
      await prisma.contactsOnSequence.update({
        where: { id: dispatch.enrollmentId, chatbotId: dispatch.chatbotId },
        data: {
          status: "completed",
          completedAt: new Date(),
          currentStep: step.order + 1,
          lastStepId: step.id,
          nextStepId: null,
          nextRunAt: null,
          updatedAt: new Date(),
        },
      })

      logger.info(
        { enrollmentId: dispatch.enrollmentId },
        "Enrollment completed",
      )
      return
    }

    // Calculate next run time
    const nextRunAt = this.calculateNextRunAt(nextStep)

    // Update enrollment
    await prisma.contactsOnSequence.update({
      where: { id: dispatch.enrollmentId, chatbotId: dispatch.chatbotId },
      data: {
        currentStep: nextStep.order,
        lastStepId: step.id,
        nextStepId: nextStep.id,
        nextRunAt,
        updatedAt: new Date(),
      },
    })

    // Create next dispatch
    const nextDispatch = await createDispatch({
      chatbotId: dispatch.chatbotId,
      sequenceId: dispatch.sequenceId,
      contactId: dispatch.contactId,
      stepId: nextStep.id,
      enrollmentId: dispatch.enrollmentId,
      runAt: nextRunAt,
    })

    // Add to schedule
    await this.dragonfly.addToSchedule(
      nextDispatch.bucket,
      nextDispatch.id,
      nextDispatch.runAtMs,
    )

    logger.info(
      {
        enrollmentId: dispatch.enrollmentId,
        nextStepId: nextStep.id,
        nextRunAt,
      },
      "Enrollment advanced to next step",
    )
  }

  private calculateNextRunAt(step: StepWithRelations): Date {
    const now = new Date()

    if (step.delayUnit === "specificTime" && step.specificDateTime) {
      return new Date(step.specificDateTime)
    }

    const delayMs =
      step.delayDays * 24 * 60 * 60 * 1000 + step.delayMinutes * 60 * 1000

    return new Date(now.getTime() + delayMs)
  }

  private async handleExecutionError(
    dispatch: DispatchWithRelations,
    error: Error | unknown,
  ): Promise<void> {
    const isRetryable = this.isRetryableError(error)
    const canRetry = dispatch.attempt < MAX_RETRY_ATTEMPTS
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (isRetryable && canRetry) {
      // Retry with exponential backoff
      const nextAttempt = dispatch.attempt + 1
      const backoffMs = Math.min(
        BASE_RETRY_DELAY_MS * 2 ** nextAttempt,
        MAX_RETRY_DELAY_MS,
      )
      const jitter = Math.random() * 1000
      const retryAtMs = Date.now() + backoffMs + jitter

      await prisma.sequenceDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: "pending",
          attempt: nextAttempt,
          lastError: errorMessage,
          updatedAt: new Date(),
        },
      })

      await prisma.sequenceEvent.create({
        data: {
          chatbotId: dispatch.chatbotId,
          sequenceId: dispatch.sequenceId,
          contactId: dispatch.contactId,
          stepId: dispatch.stepId,
          dispatchId: dispatch.id,
          eventType: "dispatch_failed_retry",
          payload: {
            attempt: nextAttempt,
            error: errorMessage,
            retryAtMs,
          },
          occurredAt: new Date(),
        },
      })

      // Add to retry queue
      await this.dragonfly.addToRetry(
        (dispatch as any).bucket,
        dispatch.id,
        retryAtMs,
      )

      logger.warn(
        {
          dispatchId: dispatch.id,
          attempt: nextAttempt,
          retryAtMs,
          error: errorMessage,
        },
        "Dispatch failed, scheduled for retry",
      )
    } else {
      // Permanent failure
      await prisma.sequenceDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          lastError: errorMessage,
          updatedAt: new Date(),
        },
      })

      await prisma.sequenceEvent.create({
        data: {
          chatbotId: dispatch.chatbotId,
          sequenceId: dispatch.sequenceId,
          contactId: dispatch.contactId,
          stepId: dispatch.stepId,
          dispatchId: dispatch.id,
          eventType: "dispatch_failed_final",
          payload: {
            attempt: dispatch.attempt,
            error: errorMessage,
          },
          occurredAt: new Date(),
        },
      })

      // Optionally pause enrollment
      await prisma.contactsOnSequence.update({
        where: { id: dispatch.enrollmentId, chatbotId: dispatch.chatbotId },
        data: {
          status: "failed",
          errorCount: { increment: 1 },
          lastError: errorMessage,
          updatedAt: new Date(),
        },
      })

      logger.error(
        {
          dispatchId: dispatch.id,
          attempt: dispatch.attempt,
          error: errorMessage,
        },
        "Dispatch permanently failed",
      )
    }

    // Release lock
    await this.dragonfly.releaseLock(dispatch.id)
  }

  private isRetryableError(error: Error | unknown): boolean {
    const errorMessage =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase()

    // Non-retryable errors
    if (
      errorMessage.includes("not found") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("validation")
    ) {
      return false
    }

    // Retryable by default (network issues, timeouts, etc.)
    return true
  }
}

// Singleton instance
let dispatchConsumer: DispatchConsumer | null = null

export function getDispatchConsumer(): DispatchConsumer {
  if (!dispatchConsumer) {
    dispatchConsumer = new DispatchConsumer()
  }
  return dispatchConsumer
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down dispatch consumer...")
  if (dispatchConsumer) {
    await dispatchConsumer.stop()
  }
})

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down dispatch consumer...")
  if (dispatchConsumer) {
    await dispatchConsumer.stop()
  }
})
