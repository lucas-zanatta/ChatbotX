import { prisma } from "@aha.chat/database"
import { SenderType } from "@aha.chat/database/types"
import type { OutgoingMessageEntity } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import type { ModelMessage } from "ai"
import {
  replyByAutomatedResponse,
  replyByGemini,
  replyByOpenAI,
} from "./replies"
import { getSelectedTools } from "./tools"
import { trackBotResponse } from "./track-bot-response"

export async function triggerAutomatedResponse({
  message,
}: {
  message: OutgoingMessageEntity
}) {
  if (!message.content) {
    return
  }

  const startTime = Date.now()
  const messageId = createId()

  if (await replyByAutomatedResponse({ message })) {
    await trackBotResponse({
      chatbotId: message.chatbotId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: true,
      responseType: "automated_response",
      result: "success",
      aiProvider: "none",
      startTime,
    })
    return
  }

  const aiAgent = await prisma.aIAgent.findFirst({
    where: { chatbotId: message.chatbotId, isDefault: true },
  })
  if (!aiAgent) {
    return
  }

  const last100Messages = await prisma.message.findMany({
    where: { conversationId: message.conversationId },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  const lastAIMessages: ModelMessage[] = []
  for (const msg of last100Messages) {
    if (!msg.content) {
      continue
    }
    if (msg.senderType === SenderType.contact) {
      lastAIMessages.push({ role: "user", content: msg.content })
    } else if (
      msg.senderType === SenderType.user ||
      msg.senderType === SenderType.bot
    ) {
      lastAIMessages.push({ role: "assistant", content: msg.content })
    }
  }
  lastAIMessages.reverse()

  const { tools, availableTools } = await getSelectedTools(aiAgent)

  if (
    await replyByOpenAI({
      message,
      lastAIMessages,
      aiAgent,
      tools,
      availableTools,
    })
  ) {
    await trackBotResponse({
      chatbotId: message.chatbotId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: true,
      responseType: "ai_agent",
      result: "success",
      aiProvider: "openai",
      startTime,
    })
    return
  }
  if (
    await replyByGemini({
      message,
      lastAIMessages,
      aiAgent,
      tools,
      availableTools,
    })
  ) {
    await trackBotResponse({
      chatbotId: message.chatbotId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: true,
      responseType: "ai_agent",
      result: "success",
      aiProvider: "gemini",
      startTime,
    })
    return
  }

  await trackBotResponse({
    chatbotId: message.chatbotId,
    conversationId: message.conversationId,
    messageId,
    hasResponse: false,
    responseType: "none",
    aiProvider: "none",
    metadata: {
      fallbackReason: "NO_INTENT_MATCH",
    },
    startTime,
  })
}
