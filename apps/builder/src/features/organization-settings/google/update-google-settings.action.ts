"use server"

import { credentialService } from "@chatbotx.io/business"
import {
  type GoogleCredential,
  type GoogleCredentialUpdate,
  googleCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"

import { organizationActionClient } from "@/lib/safe-action"

export const updateGoogleSettingsAction = organizationActionClient
  .inputSchema(googleCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: GoogleCredentialUpdate
    }) => {
      const existing = await credentialService.findDecryptedForUser({
        userId: ctx.user.id,
        type: "google",
      })

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error("Client Secret is required to configure Google.")
      }

      const verifyToken =
        parsedInput.verifyToken || existing?.config.verifyToken
      if (!verifyToken) {
        throw new Error("Verify Token is required to configure Google.")
      }

      const config: GoogleCredential = {
        clientId: parsedInput.clientId,
        clientSecret,
        verifyToken,
      }

      await credentialService.upsertForUser({
        userId: ctx.user.id,
        type: "google",
        config,
      })
    },
  )
