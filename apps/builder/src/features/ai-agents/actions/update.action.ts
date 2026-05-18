"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiAgentModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  isWebSearchSelected,
  normalizeWebSearchDomains,
} from "@/features/ai-agents/lib/web-search-tool"
import {
  type UpdateAIAgentRequest,
  updateAIAgentRequest,
} from "@/features/ai-agents/schemas/action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const updateAIAgentAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAIAgentRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateAIAgent({ workspaceId, id }, parsedInput)
  })

export const updateAIAgent = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateAIAgentRequest,
) => {
  const aiAgent = await findOrFail({
    table: aiAgentModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "AI agent not found",
  })

  const { webSearchAuthorizedDomains, ...restInput } = parsedInput
  const updateInput: typeof restInput & {
    webSearchAuthorizedDomains?: string[]
  } = { ...restInput }

  if (parsedInput.tools) {
    updateInput.webSearchAuthorizedDomains = isWebSearchSelected(
      parsedInput.tools,
    )
      ? normalizeWebSearchDomains(webSearchAuthorizedDomains)
      : []
  } else if (webSearchAuthorizedDomains) {
    updateInput.webSearchAuthorizedDomains = normalizeWebSearchDomains(
      webSearchAuthorizedDomains,
    )
  }

  await db.transaction(async (tx) => {
    // make all other agents not default
    if (updateInput.isDefault) {
      await tx
        .update(aiAgentModel)
        .set({ isDefault: false })
        .where(eq(aiAgentModel.workspaceId, ctx.workspaceId))
    }

    await tx
      .update(aiAgentModel)
      .set(updateInput)
      .where(eq(aiAgentModel.id, aiAgent.id))
  })

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiAgents`)
}
