import { integrationSendFoxService } from "@chatbotx.io/business"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import { sendFoxAuthSchema } from "@chatbotx.io/integration-send-fox"

export const getSendFoxAuth = async (workspaceId: string) => {
  const row =
    await integrationSendFoxService.findByWorkspaceIdOrFail(workspaceId)
  const auth = await encryptUtils.decryptObject(
    encryptedDataSchema.parse(row.auth),
    sendFoxAuthSchema,
  )
  return { auth, row }
}
