import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { WhatsappTemplateStatus } from "@chatbotx.io/database/partials"
import type { ListMessengerMessageTemplatesResponse } from "../schema/query"

export const messengerMessageTemplateService = {
  list: (props: {
    tx?: DatabaseClient
    where: {
      workspaceId: string
      inboxId?: string
      integrationMessengerId?: string
      status?: WhatsappTemplateStatus
    }
  }): Promise<ListMessengerMessageTemplatesResponse> => {
    const { tx = db, where } = props

    const queryWhere = {
      status: where.status,
      integrationMessengerId: where.integrationMessengerId,
      integrationMessenger: {
        workspaceId: where.workspaceId,
        inboxId: where.inboxId,
      },
    }

    return tx.query.messengerMessageTemplateModel.findMany({
      where: queryWhere,
      with: {
        integrationMessenger: true,
      },
      orderBy: { createdAt: "asc" },
    })
  },
}
