import { prisma } from "@aha.chat/database"
import type { ConversationModel } from "@aha.chat/database/types"
import { type FlowNode, StepType } from "@aha.chat/flow-config"
import { sendFlowStep } from "../../chat/handlers/send-flow-step"

export interface SendFlowDirectParams {
  flowId: string
  chatbotId: string
  contactId: string
}

export async function sendFlowDirect(
  params: SendFlowDirectParams,
): Promise<Date> {
  const { flowId, chatbotId, contactId } = params

  const conversation = await prisma.conversation.findFirst({
    where: {
      contactId,
      chatbotId,
    },
  })

  if (!conversation) {
    throw new Error(`Conversation not found for contact ${contactId}`)
  }

  const flow = await prisma.flow.findFirst({
    where: {
      id: flowId,
      chatbotId: conversation.chatbotId,
      active: true,
    },
  })

  if (!flow?.currentVersionId) {
    throw new Error(`Flow ${flowId} not found or not active`)
  }

  const flowVersion = await prisma.flowVersion.findFirst({
    where: {
      id: flow.currentVersionId,
    },
  })

  if (!flowVersion) {
    throw new Error(`FlowVersion ${flow.currentVersionId} not found`)
  }

  const startNode = (flowVersion.nodes as unknown as FlowNode[]).find(
    (n) => n.data.isStartNode,
  )

  if (!startNode) {
    throw new Error(`Flow ${flowId} has no start node`)
  }

  if ("steps" in startNode.data.details && startNode.data.details.steps) {
    await runFlowSteps(
      conversation as ConversationModel,
      flowVersion.id,
      startNode.data.details.steps,
    )
  }

  await new Promise((resolve) => setTimeout(resolve, 1000))

  if (
    "quickReplies" in startNode.data.details &&
    startNode.data.details.quickReplies.length > 0
  ) {
    await sendFlowStep({
      conversationId: conversation.id,
      flowVersionId: flowVersion.id,
      step: {
        id: `qr-${Date.now()}`,
        stepType: StepType.sendQuickReply,
        message: "Please select an option",
        buttons: startNode.data.details.quickReplies,
      },
    })
  }

  return new Date()
}

async function runFlowSteps(
  conversation: ConversationModel,
  flowVersionId: string,
  // biome-ignore lint/suspicious/noExplicitAny: flow step types are dynamic
  steps: any[],
) {
  for (const step of steps) {
    await sendFlowStep({
      conversationId: conversation.id,
      flowVersionId,
      step,
    })
  }
}
