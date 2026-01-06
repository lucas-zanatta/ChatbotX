import { prisma } from "@aha.chat/database"
import { getDragonflyClient } from "@aha.chat/scheduler"
import { createHash } from "crypto"

type PrismaTransactionClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>
async function withTransaction<T>(
  client: typeof prisma | PrismaTransactionClient,
  fn: (tx: PrismaTransactionClient) => Promise<T>,
): Promise<T> {
  if ("$transaction" in client) {
    return await (client as typeof prisma).$transaction(fn)
  }
  return await fn(client as PrismaTransactionClient)
}
export function calculateBucket(chatbotId: string, contactId: string): number {
  const key = `${chatbotId}:${contactId}`
  const hash = createHash("sha256").update(key).digest()
  return hash[0] // First byte gives 0-255
}
export function generateIdempotencyKey(
  chatbotId: string,
  enrollmentId: string,
  stepId: string,
  runAt: Date,
): string {
  return `${chatbotId}:${enrollmentId}:${stepId}:${runAt.toISOString()}`
}
export interface CreateDispatchParams {
  chatbotId: string
  sequenceId: string
  contactId: string
  stepId: string
  enrollmentId: string
  runAt: Date
  client?: PrismaTransactionClient
}
export async function createDispatch(
  params: CreateDispatchParams,
): Promise<{ id: string; bucket: number; runAtMs: number }> {
  const {
    chatbotId,
    sequenceId,
    contactId,
    stepId,
    enrollmentId,
    runAt,
    client = prisma,
  } = params
  const bucket = calculateBucket(chatbotId, contactId)
  const runAtMs = runAt.getTime()
  const idempotencyKey = generateIdempotencyKey(
    chatbotId,
    enrollmentId,
    stepId,
    runAt,
  )
  const dispatch = await client.sequenceDispatch.create({
    data: {
      chatbotId,
      sequenceId,
      contactId,
      stepId,
      enrollmentId,
      runAtMs: BigInt(runAtMs),
      bucket,
      idempotencyKey,
      status: "pending",
      attempt: 0,
    },
    select: {
      id: true,
      bucket: true,
      runAtMs: true,
    },
  })
  return {
    ...dispatch,
    runAtMs: Number(dispatch.runAtMs),
  }
}
export interface CancelPendingDispatchesParams {
  enrollmentId: string
  chatbotId: string
  reason?: string
  client?: PrismaTransactionClient
}
export async function cancelPendingDispatches(
  params: CancelPendingDispatchesParams,
): Promise<Array<{ id: string; bucket: number }>> {
  const {
    enrollmentId,
    chatbotId,
    reason = "canceled",
    client = prisma,
  } = params
  const pendingDispatches = await client.sequenceDispatch.findMany({
    where: {
      enrollmentId,
      chatbotId,
      status: "pending",
    },
    select: {
      id: true,
      bucket: true,
      sequenceId: true,
      contactId: true,
      stepId: true,
    },
  })

  if (pendingDispatches.length === 0) {
    return []
  }

  const dispatchIds = pendingDispatches.map((d) => d.id)
  await client.sequenceDispatch.updateMany({
    where: {
      id: { in: dispatchIds },
      chatbotId,
      status: "pending",
    },
    data: {
      status: "canceled",
      updatedAt: new Date(),
    },
  })
  await client.sequenceEvent.createMany({
    data: pendingDispatches.map((d) => ({
      chatbotId,
      sequenceId: d.sequenceId,
      contactId: d.contactId,
      stepId: d.stepId,
      dispatchId: d.id,
      eventType: "dispatch_canceled",
      payload: { reason },
      occurredAt: new Date(),
    })),
  })

  const dragonfly = getDragonflyClient()
  for (const dispatch of pendingDispatches) {
    await dragonfly.removeFromSchedule(dispatch.bucket, dispatch.id)
  }

  return pendingDispatches.map((d) => ({
    id: d.id,
    bucket: d.bucket,
  }))
}
export interface RescheduleEnrollmentParams {
  enrollmentId: string
  chatbotId: string
  newNextRunAt: Date
  newStepId: string
  client?: PrismaTransactionClient
}
export async function rescheduleEnrollment(
  params: RescheduleEnrollmentParams,
): Promise<{
  canceled: Array<{ id: string; bucket: number }> | null
  created: { id: string; bucket: number; runAtMs: number } | null
}> {
  const {
    enrollmentId,
    chatbotId,
    newNextRunAt,
    newStepId,
    client = prisma,
  } = params
  return await withTransaction(client, async (tx) => {
    await tx.contactsOnSequence.update({
      where: {
        id_chatbotId: {
          id: enrollmentId,
          chatbotId,
        },
      },
      data: {
        nextRunAt: newNextRunAt,
        nextStepId: newStepId,
        updatedAt: new Date(),
      },
    })
    const currentDispatch = await tx.sequenceDispatch.findFirst({
      where: {
        enrollmentId,
        chatbotId,
        status: { in: ["pending", "running"] },
      },
      orderBy: { runAtMs: "desc" },
      select: {
        id: true,
        bucket: true,
        status: true,
        sequenceId: true,
        contactId: true,
        stepId: true,
      },
    })
    let canceled: Array<{ id: string; bucket: number }> | null = null
    if (currentDispatch && currentDispatch.status === "pending") {
      await tx.sequenceDispatch.update({
        where: {
          id_chatbotId: {
            id: currentDispatch.id,
            chatbotId,
          },
          status: "pending",
        },
        data: {
          status: "canceled",
          updatedAt: new Date(),
        },
      })
      await tx.sequenceEvent.create({
        data: {
          chatbotId,
          sequenceId: currentDispatch.sequenceId,
          contactId: currentDispatch.contactId,
          stepId: currentDispatch.stepId,
          dispatchId: currentDispatch.id,
          eventType: "dispatch_canceled",
          payload: { reason: "reschedule" },
          occurredAt: new Date(),
        },
      })
      canceled = [
        {
          id: currentDispatch.id,
          bucket: currentDispatch.bucket,
        },
      ]
    }
    const enrollment = await tx.contactsOnSequence.findUniqueOrThrow({
      where: {
        id_chatbotId: {
          id: enrollmentId,
          chatbotId,
        },
      },
      select: {
        sequenceId: true,
        contactId: true,
      },
    })
    const created = await createDispatch({
      chatbotId,
      sequenceId: enrollment.sequenceId,
      contactId: enrollment.contactId,
      stepId: newStepId,
      enrollmentId,
      runAt: newNextRunAt,
      client: tx,
    })
    return { canceled, created }
  })
}
export interface PauseEnrollmentParams {
  enrollmentId: string
  chatbotId: string
  client?: PrismaTransactionClient
}
export async function pauseEnrollment(
  params: PauseEnrollmentParams,
): Promise<Array<{ id: string; bucket: number }>> {
  const { enrollmentId, chatbotId, client = prisma } = params
  return await withTransaction(client, async (tx) => {
    await tx.contactsOnSequence.update({
      where: {
        id_chatbotId: {
          id: enrollmentId,
          chatbotId,
        },
      },
      data: {
        status: "paused",
        updatedAt: new Date(),
      },
    })
    return await cancelPendingDispatches({
      enrollmentId,
      chatbotId,
      reason: "paused",
      client: tx,
    })
  })
}
export interface ResumeEnrollmentParams {
  enrollmentId: string
  chatbotId: string
  nextRunAt: Date
  nextStepId: string
  client?: PrismaTransactionClient
}
export async function resumeEnrollment(
  params: ResumeEnrollmentParams,
): Promise<{ id: string; bucket: number; runAtMs: number }> {
  const {
    enrollmentId,
    chatbotId,
    nextRunAt,
    nextStepId,
    client = prisma,
  } = params
  return await withTransaction(client, async (tx) => {
    await tx.contactsOnSequence.update({
      where: {
        id_chatbotId: {
          id: enrollmentId,
          chatbotId,
        },
      },
      data: {
        status: "active",
        nextRunAt,
        nextStepId,
        updatedAt: new Date(),
      },
    })
    const enrollment = await tx.contactsOnSequence.findUniqueOrThrow({
      where: {
        id_chatbotId: {
          id: enrollmentId,
          chatbotId,
        },
      },
      select: {
        sequenceId: true,
        contactId: true,
      },
    })
    const result = await createDispatch({
      chatbotId,
      sequenceId: enrollment.sequenceId,
      contactId: enrollment.contactId,
      stepId: nextStepId,
      enrollmentId,
      runAt: nextRunAt,
      client: tx,
    })
    return result
  })
}
