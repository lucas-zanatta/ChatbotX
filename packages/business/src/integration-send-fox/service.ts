import { db, eq, isDatabaseError } from "@chatbotx.io/database/client"
import {
  integrationModel,
  integrationSendFoxModel,
} from "@chatbotx.io/database/schema"
import { encryptUtils } from "@chatbotx.io/encryption"
import type { AuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

const WORKSPACE_UNIQUE_CONSTRAINT = "IntegrationSendFox_workspaceId_key"

const isWorkspaceUniqueViolation = (error: unknown): boolean => {
  if (!(isDatabaseError(error) && error.cause.code === "23505")) {
    return false
  }
  return (
    "constraint" in error.cause &&
    error.cause.constraint === WORKSPACE_UNIQUE_CONSTRAINT
  )
}

class IntegrationSendFoxService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationSendFoxModel.findFirst({
      where: { workspaceId },
    })
  }

  async findByWorkspaceIdOrFail(workspaceId: string) {
    const integration = await this.findByWorkspaceId(workspaceId)
    if (!integration) {
      throw new Error("SendFox integration not found")
    }
    return integration
  }

  async upsert(props: { workspaceId: string; auth: AuthValue }) {
    const encryptedAuth = await encryptUtils.encryptObject(props.auth)
    const updateExisting = async () => {
      const existing = await this.findByWorkspaceId(props.workspaceId)
      if (!existing) {
        return
      }
      await db
        .update(integrationSendFoxModel)
        .set({ auth: encryptedAuth })
        .where(eq(integrationSendFoxModel.id, existing.id))
      return existing.id
    }

    const existingId = await updateExisting()
    if (existingId) {
      return existingId
    }

    const integrationId = createId()
    const sendFoxId = createId()
    try {
      await db.transaction(async (tx) => {
        await tx.insert(integrationModel).values({
          id: integrationId,
          workspaceId: props.workspaceId,
          integrationType: "sendFox",
        })
        await tx.insert(integrationSendFoxModel).values({
          id: sendFoxId,
          workspaceId: props.workspaceId,
          integrationId,
          auth: encryptedAuth,
        })
      })
      return sendFoxId
    } catch (error) {
      if (!isWorkspaceUniqueViolation(error)) {
        throw error
      }
      const winnerId = await updateExisting()
      if (!winnerId) {
        throw error
      }
      return winnerId
    }
  }

  async disconnect(workspaceId: string) {
    const existing = await this.findByWorkspaceId(workspaceId)
    if (!existing) {
      return
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(integrationSendFoxModel)
        .where(eq(integrationSendFoxModel.id, existing.id))
      await tx
        .delete(integrationModel)
        .where(eq(integrationModel.id, existing.integrationId))
    })
  }
}

export const integrationSendFoxService = new IntegrationSendFoxService()
