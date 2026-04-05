import {
  and,
  type DatabaseClient,
  eq,
  inArray,
} from "@aha.chat/database/client"
import {
  sequenceDispatchModel,
} from "@aha.chat/database/schema"

export const sequenceDispatchUtils = {
  bulkCancelPendingDispatches: async (props: {
    dbClient: DatabaseClient
    chatbotId: string
    enrollmentId: string
    reason?: "canceled"
  }) => {
    const { dbClient, chatbotId, enrollmentId, reason } = props

    // Find all pending dispatches for the enrollment
    const pendingDispatches =
      await dbClient.query.sequenceDispatchModel.findMany({
        where: {
          enrollmentId,
          chatbotId,
          status: "pending",
        },
        columns: {
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
    const updatedDispatches = await dbClient
      .update(sequenceDispatchModel)
      .set({
        status: "canceled",
      })
      .where(
        and(
          inArray(sequenceDispatchModel.id, dispatchIds),
          eq(sequenceDispatchModel.status, "pending"),
        ),
      )
      .returning()

    if (updatedDispatches.length === 0) {
      return []
    }

    return pendingDispatches.map((d) => ({
      id: d.id,
      bucket: d.bucket,
    }))
  },
}

export type SequenceDispatchUtils = typeof sequenceDispatchUtils
