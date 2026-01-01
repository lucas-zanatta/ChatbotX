import { prisma } from "@aha.chat/database"
import { getDragonflyClient } from "@aha.chat/scheduler"
import { createDispatch } from "./dispatch-manager"

type PrismaTransactionClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>
export interface EnrollContactParams {
  chatbotId: string
  contactId: string
  sequenceId: string
  nextRunAt: Date
  nextStepId: string | null
  enrolledAt?: Date
  client?: PrismaTransactionClient
}
export async function enrollContactInSequence(
  params: EnrollContactParams,
): Promise<void> {
  const {
    chatbotId,
    contactId,
    sequenceId,
    nextRunAt,
    nextStepId,
    enrolledAt = new Date(),
    client = prisma,
  } = params

  const existing = await client.contactsOnSequence.findUnique({
    where: {
      contactId_sequenceId: {
        contactId,
        sequenceId,
      },
    },
    select: { id: true },
  })

  if (existing) {
    return
  }

  const enrollment = await client.contactsOnSequence.create({
    data: {
      chatbotId,
      contactId,
      sequenceId,
      currentStep: 0,
      status: "active",
      nextRunAt,
      nextStepId,
      enrolledAt,
    },
  })
  if (!nextStepId) {
    return
  }
  const dispatch = await createDispatch({
    chatbotId,
    sequenceId,
    contactId,
    stepId: nextStepId,
    enrollmentId: enrollment.id,
    runAt: nextRunAt,
    client,
  })

  const dragonfly = getDragonflyClient()
  await dragonfly.addToSchedule(dispatch.bucket, dispatch.id, dispatch.runAtMs)
}
export interface EnrollContactsBulkParams {
  chatbotId: string
  enrollments: Array<{
    contactId: string
    sequenceId: string
    nextRunAt: Date
    nextStepId: string | null
  }>
  enrolledAt?: Date
}
export async function enrollContactsInSequenceBulk(
  params: EnrollContactsBulkParams,
): Promise<void> {
  const { chatbotId, enrollments, enrolledAt = new Date() } = params
  const createdEnrollments = await prisma.$transaction(async (tx) => {
    await tx.contactsOnSequence.createMany({
      data: enrollments.map((e) => ({
        chatbotId,
        contactId: e.contactId,
        sequenceId: e.sequenceId,
        currentStep: 0,
        status: "active",
        nextRunAt: e.nextRunAt,
        nextStepId: e.nextStepId,
        enrolledAt,
      })),
      skipDuplicates: true,
    })
    return await tx.contactsOnSequence.findMany({
      where: {
        chatbotId,
        contactId: { in: enrollments.map((e) => e.contactId) },
        sequenceId: { in: enrollments.map((e) => e.sequenceId) },
      },
      select: {
        id: true,
        contactId: true,
        sequenceId: true,
        nextRunAt: true,
        nextStepId: true,
      },
    })
  })
  const dragonfly = getDragonflyClient()
  for (const enrollment of createdEnrollments) {
    if (!(enrollment.nextStepId && enrollment.nextRunAt)) {
      continue
    }
    const dispatch = await createDispatch({
      chatbotId,
      sequenceId: enrollment.sequenceId,
      contactId: enrollment.contactId,
      stepId: enrollment.nextStepId,
      enrollmentId: enrollment.id,
      runAt: enrollment.nextRunAt,
    })
    await dragonfly.addToSchedule(
      dispatch.bucket,
      dispatch.id,
      dispatch.runAtMs,
    )
  }
}
