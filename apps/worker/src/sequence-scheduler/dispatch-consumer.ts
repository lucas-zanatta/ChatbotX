import { type Prisma, prisma } from "@aha.chat/database"
import { getDragonflyClient } from "@aha.chat/scheduler"
import {
  calculateNextRunAtFromStep,
  calculateNextValidSendTime,
  createDispatch,
} from "@aha.chat/sequence-scheduler"
import { type Consumer, Kafka } from "kafkajs"
import pLimit, { type LimitFunction } from "p-limit"
import { sendFlowDirect } from "../integration/handlers/send-flow-direct"
import { logger } from "../lib/logger"

const MAX_WAIT_TIME_IN_MS = 100
const SESSION_TIMEOUT_IN_MS = 30_000
const HEARTBEAT_INTERVAL_IN_MS = 3000
const MAX_PROCESS = 10

interface ConsumerConfig {
  groupId: string
  maxWaitTimeInMs: number
  sessionTimeout: number
  heartbeatInterval: number
  maxProcess: number
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

type DispatchMessage = {
  dispatchId: string
  claimedAt: number
  bucket: number
}

export class DispatchConsumer {
  private running = false
  private readonly kafka: Kafka
  private readonly consumer: Consumer
  private readonly dragonfly = getDragonflyClient()
  private readonly config: ConsumerConfig
  private readonly limitProcess: LimitFunction

  constructor(config: Partial<ConsumerConfig> = {}) {
    this.config = {
      groupId: config.groupId || "sequence-dispatch-consumer",
      maxWaitTimeInMs: config.maxWaitTimeInMs || MAX_WAIT_TIME_IN_MS,
      sessionTimeout: config.sessionTimeout || SESSION_TIMEOUT_IN_MS,
      heartbeatInterval: config.heartbeatInterval || HEARTBEAT_INTERVAL_IN_MS,
      maxProcess: config.maxProcess || MAX_PROCESS,
    }

    this.limitProcess = pLimit(this.config.maxProcess)

    const kafkaBrokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(
      ",",
    )

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
      groupId: this.config.groupId,
      sessionTimeout: this.config.sessionTimeout,
      heartbeatInterval: this.config.heartbeatInterval,
      maxWaitTimeInMs: this.config.maxWaitTimeInMs,
    })
  }

  async start() {
    if (this.running) {
      logger.warn("Dispatch consumer already running")
      return
    }

    logger.info("Starting dispatch comsumer...")

    await this.consumer.connect()
    await this.consumer.subscribe({
      topic: "seq.dispatch.run",
      fromBeginning: false,
    })

    await this.consumer.run({
      autoCommit: true,
      eachMessage: async ({ message }) => {
        try {
          const payload = JSON.parse(message.value?.toString() || "{}")
          await this.limitProcess(() => this.processDispatch(payload))
        } catch (error) {
          logger.error({ error, message }, "Error processing dispatch message")
        }
      },
    })

    this.running = true
    logger.info("Dispatch consumer started")
  }

  private async processDispatch(payload: DispatchMessage) {
    const startTime = Date.now()

    try {
      const dispatch = (await prisma.sequenceDispatch.findUnique({
        where: { id: payload.dispatchId },
        include: {
          sequence: true,
          contact: true,
          enrollment: true,
        },
      })) as DispatchWithRelations | null

      if (!dispatch) {
        logger.warn({ dispatchId: payload.dispatchId }, "Dispatch not found")
        return
      }

      if (dispatch.status !== "pending") {
        logger.warn({ dispatchId: payload.dispatchId }, "Dispatch not pending")
        return
      }

      const nowMs = Date.now()
      const runAt = Number(dispatch.runAtMs)

      if (runAt > nowMs + 1000) {
        logger.warn({ dispatchId: payload.dispatchId }, "Dispatch not ready")
        await this.dragonfly.addToSchedule(
          dispatch.bucket,
          payload.dispatchId,
          runAt,
        )
        return
      }

      const updated = await prisma.sequenceDispatch.updateMany({
        where: {
          id: dispatch.id,
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
        logger.warn({ dispatchId: payload.dispatchId }, "Dispatch not acquired")
        return
      }

      await this.executeStep(dispatch)

      const duration = Date.now() - startTime
      logger.info(
        {
          dispatchId: payload.dispatchId,
          duration,
          contactId: dispatch.contactId,
        },
        "Dispatch completed successfully",
      )
    } catch (error) {
      logger.error({ error, payload }, "Error processing dispatch")

      try {
        await this.dragonfly.releaseLock(payload.bucket, payload.dispatchId)
      } catch (lockError) {
        logger.error(
          { lockError, dispatchId: payload.dispatchId },
          "Error releasing lock",
        )
      }
    }
  }

  private async executeStep(dispatch: DispatchWithRelations) {
    try {
      const step = await prisma.sequenceStep.findUnique({
        where: { id: dispatch.stepId },
        include: { flow: true },
      })

      if (!step) {
        throw new Error(`Step ${dispatch.stepId} not found`)
      }

      if (!step.isActive) {
        logger.warn(
          { dispatchId: dispatch.id, stepId: step.id },
          "Step is not active, skipping",
        )
        await this.markDispatchCanceled(
          dispatch.id,
          dispatch.chatbotId,
          "step_inactive",
        )
        return
      }

      if (!step.flow) {
        throw new Error(`Step ${dispatch.stepId} has no flow configured`)
      }

      const sentAt = await this.sendFlowMessage(dispatch, step)

      await prisma.sequenceDispatch.update({
        where: {
          id: dispatch.id,
        },
        data: {
          status: "completed",
          completedAt: sentAt,
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
          eventType: "dispatch_completed",
          payload: {
            attempt: dispatch.attempt,
            duration: Date.now() - Number(dispatch.runAtMs),
          },
          occurredAt: sentAt,
        },
      })

      await this.advanceEnrollment(dispatch, step, sentAt)

      await this.dragonfly.releaseLock(dispatch.bucket, dispatch.id)
    } catch (error) {
      logger.error({ error, dispatchId: dispatch.id }, "Error executing step")

      try {
        await this.markDispatchFailed(
          dispatch.id,
          dispatch.chatbotId,
          error instanceof Error ? error.message : "Unknown error",
        )
      } catch (markError) {
        logger.error(
          { markError, dispatchId: dispatch.id },
          "Failed to mark dispatch as failed",
        )
      }

      try {
        await this.dragonfly.releaseLock(dispatch.bucket, dispatch.id)
      } catch (lockError) {
        logger.error(
          { lockError, dispatchId: dispatch.id },
          "Failed to release lock after error",
        )
      }
    }
  }

  private async advanceEnrollment(
    dispatch: DispatchWithRelations,
    step: StepWithRelations,
    sentAt: Date,
  ) {
    await prisma.$transaction(async (tx) => {
      const enrollment = await tx.contactsOnSequence.findUnique({
        where: {
          id: dispatch.enrollmentId,
          chatbotId: dispatch.chatbotId,
        },
      })

      if (!enrollment) {
        throw new Error(`Enrollment ${dispatch.enrollmentId} not found`)
      }

      if (enrollment.status !== "active") {
        logger.warn(
          {
            enrollmentId: dispatch.enrollmentId,
            status: enrollment.status,
          },
          "Enrollment not active, skipping advancement",
        )
        return
      }

      if (enrollment.lastStepId === step.id) {
        logger.warn(
          {
            enrollmentId: dispatch.enrollmentId,
            stepId: step.id,
          },
          "Step already processed (duplicate), skipping",
        )
        return
      }

      const nextStep = (await tx.sequenceStep.findFirst({
        where: {
          sequenceId: dispatch.sequenceId,
          order: { gt: step.order },
          isActive: true,
        },
        orderBy: { order: "asc" },
        include: { flow: true },
      })) as StepWithRelations | null

      if (!nextStep) {
        await tx.contactsOnSequence.update({
          where: { id: dispatch.enrollmentId, chatbotId: dispatch.chatbotId },
          data: {
            status: "completed",
            completedAt: sentAt,
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

      const nextRunAt = this.calculateNextRunAt(nextStep, sentAt)

      await tx.contactsOnSequence.update({
        where: { id: dispatch.enrollmentId, chatbotId: dispatch.chatbotId },
        data: {
          currentStep: nextStep.order,
          lastStepId: step.id,
          nextStepId: nextStep.id,
          nextRunAt,
          updatedAt: new Date(),
        },
      })

      const nextDispatch = await createDispatch({
        chatbotId: dispatch.chatbotId,
        sequenceId: dispatch.sequenceId,
        contactId: dispatch.contactId,
        stepId: nextStep.id,
        enrollmentId: dispatch.enrollmentId,
        runAt: nextRunAt,
        client: tx,
      })

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
    })
  }

  private calculateNextRunAt(step: StepWithRelations, baseTime: Date): Date {
    const calculatedTime = calculateNextRunAtFromStep(
      {
        delayDays: step.delayDays,
        delayMinutes: step.delayMinutes,
        delayUnit: step.delayUnit,
        specificDateTime: step.specificDateTime,
      },
      baseTime,
    )

    const validSendTime = calculateNextValidSendTime(calculatedTime, {
      anytime: step.anytime,
      sendTimeStart: step.sendTimeStart,
      sendTimeEnd: step.sendTimeEnd,
      sendDays: step.sendDays,
    })

    return validSendTime
  }

  private async sendFlowMessage(
    dispatch: DispatchWithRelations,
    step: StepWithRelations,
  ): Promise<Date> {
    if (!step.flow) {
      throw new Error(`Step ${step.id} has no flow configured`)
    }

    const sentAt = await sendFlowDirect({
      flowId: step.flow.id,
      chatbotId: dispatch.chatbotId,
      contactId: dispatch.contactId,
    })

    logger.info(
      {
        dispatchId: dispatch.id,
        contactId: dispatch.contactId,
        flowId: step.flow.id,
        sentAt,
      },
      "Flow message sent",
    )

    return sentAt
  }

  private async markDispatchFailed(
    dispatchId: string,
    chatbotId: string,
    errorMessage: string,
  ) {
    await prisma.sequenceDispatch.update({
      where: { id: dispatchId, chatbotId },
      data: {
        status: "failed",
        updatedAt: new Date(),
      },
    })

    logger.error({ dispatchId, errorMessage }, "Dispatch marked as failed")
  }

  private async markDispatchCanceled(
    dispatchId: string,
    chatbotId: string,
    reason: string,
  ) {
    await prisma.sequenceDispatch.update({
      where: { id: dispatchId, chatbotId },
      data: {
        status: "canceled",
        updatedAt: new Date(),
      },
    })

    logger.info({ dispatchId, reason }, "Dispatch marked as canceled")
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
}

let dispatchConsumer: DispatchConsumer | null = null

export function getDispatchConsumer() {
  if (!dispatchConsumer) {
    dispatchConsumer = new DispatchConsumer()
  }
  return dispatchConsumer
}

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down dispatch consumer...")

  if (dispatchConsumer) {
    await dispatchConsumer.stop()
  }
})

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down dispatch consumer...")

  if (dispatchConsumer) {
    await dispatchConsumer.stop()
  }
})
