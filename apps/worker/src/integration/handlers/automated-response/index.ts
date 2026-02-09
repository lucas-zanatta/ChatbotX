import { prisma } from "@aha.chat/database"
import { SenderType } from "@aha.chat/database/types"
import type { OutgoingMessageEntity } from "@aha.chat/sdk"
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
  messageId,
}: {
  message: OutgoingMessageEntity
  messageId: string
}) {
  if (!message.content) {
    await trackBotResponse({
      chatbotId: message.chatbotId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: false,
      responseType: "none",
      routeType: "FALLBACK",
      result: "fallback",
      aiProvider: "none",
      startTime: Date.now(),
      metadata: {
        fallbackReason: "NO_CONTENT",
      },
    })

    return
  }

  const startTime = Date.now()

  // messageId should always come from DB message table
  if (!messageId) {
    throw new Error("messageId is required for tracking")
  }

  // Step 1: Try automated response matching (intent/flow matching)
  const automatedResult = await replyByAutomatedResponse({ message, messageId })
  if (automatedResult.replied) {
    if (automatedResult.isFlow) {
      // Flow response will be tracked in send-flow-node.ts with routeType: "FLOW"
    } else {
      await trackBotResponse({
        chatbotId: message.chatbotId,
        conversationId: message.conversationId,
        messageId,
        hasResponse: true,
        responseType: "automated_response",
        routeType: "FLOW",
        result: "success",
        aiProvider: "none",
        startTime,
        metadata: {
          automatedResponseId: automatedResult.automatedResponseId,
        },
      })
    }
    return
  }

  // Step 2: Check if AI Agent exists for routing decision
  const aiAgent = await prisma.aIAgent.findFirst({
    where: { chatbotId: message.chatbotId, isDefault: true },
  })
  if (!aiAgent) {
    // No AI Agent configured → Route to FALLBACK
    await trackBotResponse({
      chatbotId: message.chatbotId,
      conversationId: message.conversationId,
      messageId,
      hasResponse: false,
      responseType: "none",
      routeType: "FALLBACK",
      result: "fallback",
      aiProvider: "none",
      metadata: {
        fallbackReason: "NO_AI_AGENT",
      },
      startTime,
    })
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

  // Step 3: AI Agent exists → Route to AGENT
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
      routeType: "AGENT",
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
      routeType: "AGENT",
      result: "success",
      aiProvider: "gemini",
      startTime,
    })
    return
  }

  // Step 4: AI Agent failed to respond → Still routed to AGENT, but response failed
  // This is NOT fallback - routing decision was AGENT, but execution failed
  await trackBotResponse({
    chatbotId: message.chatbotId,
    conversationId: message.conversationId,
    messageId,
    hasResponse: false,
    responseType: "ai_agent",
    routeType: "AGENT",
    result: "success",
    aiProvider: "none",
    metadata: {
      fallbackReason: "NO_INTENT_MATCH",
    },
    startTime,
  })
}
