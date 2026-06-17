"use server"

import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import { getInstagramMediaList } from "@chatbotx.io/integration-instagram"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { listIntegrationInstagrams } from "@/features/integration-instagram/queries"
import { workspaceActionClient } from "@/lib/safe-action"

export const listInstagramMediaAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(
    z.object({
      limit: z.number().int().min(1).max(50).optional(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { data: integrations } = await listIntegrationInstagrams({
      workspaceId: ctx.workspace.id,
    })
    const integrationInstagram = integrations.at(0)

    if (!integrationInstagram) {
      throw new Error("Instagram integration not found")
    }

    const auth = integrationInstagram.auth as InstagramAuthValue
    const data = await getInstagramMediaList({
      auth,
      limit: parsedInput.limit,
    })

    return {
      data: data.map((media) => ({
        id: media.id,
        caption: media.caption,
        mediaType: media.media_type,
        permalink: media.permalink,
        timestamp: media.timestamp,
        thumbnailUrl: media.thumbnail_url ?? media.media_url,
      })),
    }
  })
