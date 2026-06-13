import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationMailerLiteModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { encryptUtils } from "@chatbotx.io/encryption"
import type { AuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

class IntegrationMailerLiteService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationMailerLiteModel.findFirst({
      where: { workspaceId },
    })
  }

  async findByWorkspaceIdOrFail(workspaceId: string) {
    const integration = await this.findByWorkspaceId(workspaceId)
    if (!integration) {
      throw new Error("MailerLite integration not found")
    }
    return integration
  }

  async upsert(props: { workspaceId: string; auth: AuthValue }) {
    const encryptedAuth = await encryptUtils.encryptObject(props.auth)
    const updated = await db
      .update(integrationMailerLiteModel)
      .set({ auth: encryptedAuth })
      .where(eq(integrationMailerLiteModel.workspaceId, props.workspaceId))
      .returning({ id: integrationMailerLiteModel.id })
    if (updated[0]) {
      return updated[0].id
    }

    try {
      return await db.transaction(async (tx) => {
        const integrationId = createId()
        const mailerLiteId = createId()
        await tx.insert(integrationModel).values({
          id: integrationId,
          workspaceId: props.workspaceId,
          integrationType: "mailerLite",
        })
        await tx.insert(integrationMailerLiteModel).values({
          id: mailerLiteId,
          workspaceId: props.workspaceId,
          integrationId,
          auth: encryptedAuth,
        })
        return mailerLiteId
      })
    } catch {
      const recovered = await db
        .update(integrationMailerLiteModel)
        .set({ auth: encryptedAuth })
        .where(eq(integrationMailerLiteModel.workspaceId, props.workspaceId))
        .returning({ id: integrationMailerLiteModel.id })
      if (!recovered[0]) {
        throw new Error("Failed to connect MailerLite integration")
      }
      return recovered[0].id
    }
  }

  async disconnect(workspaceId: string) {
    const existing = await this.findByWorkspaceId(workspaceId)
    if (!existing) {
      return
    }
    await db
      .delete(integrationModel)
      .where(eq(integrationModel.id, existing.integrationId))
  }
}

export const integrationMailerLiteService = new IntegrationMailerLiteService()
