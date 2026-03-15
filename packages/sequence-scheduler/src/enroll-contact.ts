import { db } from "@aha.chat/database/client"
import type * as schema from "@aha.chat/database/schema"
import { contactsOnSequenceModel } from "@aha.chat/database/schema"
import { getDragonflyClient } from "@aha.chat/scheduler"
import { createId } from "@paralleldrive/cuid2"
import type { ExtractTablesWithRelations } from "drizzle-orm"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"
import { createDispatch } from "./dispatch-manager"

type DrizzleTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>

export interface EnrollContactParams {
  chatbotId: string
  client?: DrizzleTransaction
  contactId: string
  enrolledAt?: Date
  nextRunAt: Date
  nextStepId: string | null
  sequenceId: string
}
export async function enrollContactInSequence(params: EnrollContactParams) {
  const {
    chatbotId,
    contactId,
    sequenceId,
    nextRunAt,
    nextStepId,
    enrolledAt = new Date(),
    client = db,
  } = params

  const existing = await client.query.contactsOnSequenceModel.findFirst({
    where: (cos, { eq, and }) =>
      and(
        eq(cos.contactId, contactId),
        eq(cos.sequenceId, sequenceId),
        eq(cos.chatbotId, chatbotId),
      ),
    columns: { id: true },
  })

  if (existing) {
    return
  }

  const enrollmentId = createId()
  const [enrollment] = await client
    .insert(contactsOnSequenceModel)
    .values({
      id: enrollmentId,
      chatbotId,
      contactId,
      sequenceId,
      currentStep: 0,
      status: "active",
      nextRunAt,
      nextStepId,
      enrolledAt,
    })
    .returning({ id: contactsOnSequenceModel.id })

  if (!(nextStepId && enrollment)) {
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
  enrolledAt?: Date
  enrollments: Array<{
    contactId: string
    sequenceId: string
    nextRunAt: Date
    nextStepId: string | null
  }>
}
export async function enrollContactsInSequenceBulk(
  params: EnrollContactsBulkParams,
) {
  const { chatbotId, enrollments, enrolledAt = new Date() } = params
  const createdEnrollments = await db.transaction(async (tx) => {
    await tx
      .insert(contactsOnSequenceModel)
      .values(
        enrollments.map((e) => ({
          id: createId(),
          chatbotId,
          contactId: e.contactId,
          sequenceId: e.sequenceId,
          currentStep: 0,
          status: "active" as const,
          nextRunAt: e.nextRunAt,
          nextStepId: e.nextStepId,
          enrolledAt,
        })),
      )
      .onConflictDoNothing()

    const contactIds = enrollments.map((e) => e.contactId)
    const sequenceIds = enrollments.map((e) => e.sequenceId)

    return await tx.query.contactsOnSequenceModel.findMany({
      where: (cos, { eq, and, inArray }) =>
        and(
          eq(cos.chatbotId, chatbotId),
          inArray(cos.contactId, contactIds),
          inArray(cos.sequenceId, sequenceIds),
        ),
      columns: {
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
