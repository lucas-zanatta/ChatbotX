import { db } from "@chatbotx.io/database/client"
import type {
  AIAgentProvider,
  AIAgentProviderModel,
  AIAgentProviderModels,
} from "@chatbotx.io/database/partials"
import type { AutomatedResponseModel } from "@chatbotx.io/database/types"
import type {
  BotResponseTrackingContext,
  IntegrationJobTriggerAutomatedResponse,
} from "@chatbotx.io/worker-config"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { stepCountIs, streamText, type ToolSet } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { createAIModelInstance, getAIIntegrationInDB } from "../../../lib/ai"
import { logger } from "../../../lib/logger"
import { getAIToolset } from "../generate-text/tools"
import { aiTimeouts, helpTexts } from "./constants"
import { processStreamingText, sendMessageWithRender } from "./text"
import type { ReplyByAIProps } from "./types"

export async function replaceCustomFieldAttributes(
  message: string,
  conversationId: string,
): Promise<string> {
  try {
    const conversation = await db.query.conversationModel.findFirst({
      where: { id: conversationId },
      with: {
        contact: {
          with: {
            contactCustomFields: {
              with: {
                customField: true,
              },
            },
          },
        },
      },
    })

    if (!conversation?.contact) {
      return message
    }

    const fieldMap = new Map<string, string>()
    for (const customField of conversation.contact.contactCustomFields) {
      if (customField.customField?.name && customField.value) {
        fieldMap.set(customField.customField.name, customField.value)
      }
    }

    let processedMessage = message
    const attributeRegex = /\{\{(\w+)\}\}/g

    processedMessage = processedMessage.replace(
      attributeRegex,
      (match, fieldName) => {
        const value = fieldMap.get(fieldName)
        return value || match
      },
    )

    return processedMessage
  } catch {
    return message
  }
}

async function listAllEnabledAutomatedResponses({
  workspaceId,
}: {
  workspaceId: string
}): Promise<AutomatedResponseModel[]> {
  try {
    return await db.query.automatedResponseModel.findMany({
      where: { workspaceId, status: true },
    })
  } catch {
    return []
  }
}

export async function replyByAutomatedResponse(
  props: IntegrationJobTriggerAutomatedResponse["data"],
  trackingContext: BotResponseTrackingContext,
): Promise<boolean> {
  const { message, conversation } = props

  try {
    let replied = false
    const allAutomatedResponses = await listAllEnabledAutomatedResponses({
      workspaceId: message.workspaceId,
    })
    if (allAutomatedResponses.length === 0) {
      return false
    }

    const messageText = (message.text ?? "").toLowerCase()
    for (const automatedResponse of allAutomatedResponses) {
      const matched = automatedResponse.keywords
        .map((v) => v.toLowerCase())
        .some((v) => messageText.includes(v))

      if (!matched) {
        continue
      }

      if (automatedResponse.text) {
        const stepMessage = await replaceCustomFieldAttributes(
          automatedResponse.text,
          message.conversationId,
        )
        await chatQueue.add(ChatJobAction.sendChatMessage, {
          type: ChatJobAction.sendChatMessage,
          data: {
            conversation,
            text: stepMessage,
            trackingContext,
          },
        })
        replied = true
      } else if (automatedResponse.flowId) {
        const flow = await db.query.flowModel.findFirst({
          where: {
            id: automatedResponse.flowId,
            currentVersionId: { isNotNull: true },
          },
        })
        if (flow) {
          await integrationQueue.add(IntegrationJobAction.sendFlow, {
            type: IntegrationJobAction.sendFlow,
            data: {
              conversationId: message.conversationId,
              flowId: flow.id,
              trackingContext,
            },
          })
          replied = true
        }
      }
    }
    return replied
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(
      {
        error: parsedError,
        props,
      },
      "[automated-response] replyByAutomatedResponse failed",
    )
    return false
  }
}

export async function replyByAI(
  props: ReplyByAIProps,
): Promise<null | ReplyByAIExecutionResult> {
  const { aiAgent } = props
  const providers = aiAgent.models as AIAgentProviderModels

  const { tools, cleanup } = await getAIToolset(
    aiAgent.workspaceId,
    aiAgent.tools,
  )

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    for (const providerInfo of providers) {
      const result = await runAIReply(
        props,
        providerInfo,
        tools,
        controller.signal,
      )
      if (result?.responded) {
        return result
      }
    }
  } finally {
    clearTimeout(timeoutId)
    await cleanup()
  }

  return null
}

async function runAIReply(
  props: ReplyByAIProps,
  providerInfo: AIAgentProviderModel,
  tools: ToolSet,
  abortSignal: AbortSignal,
): Promise<null | ReplyByAIExecutionResult> {
  const { message, lastAIMessages, aiAgent } = props
  const provider = providerInfo.provider
  try {
    const selectedModelId = providerInfo.model

    const integration = await getAIIntegrationInDB({
      workspaceId: message.workspaceId,
      provider,
      autoReply: true,
    })

    if (!integration) {
      return null
    }

    const model = createAIModelInstance({
      model: integration,
      provider,
      modelId: selectedModelId,
      abortSignal,
      traceId: message.conversationId,
    })

    const completePrompt = await replaceCustomFieldAttributes(
      aiAgent.prompt || "",
      message.conversationId,
    )
    const systemPrompt = appendToolOutputGuard(completePrompt)

    const toolNamesSet = new Set<string>()
    const finishReasons: Array<{
      stepNumber: number
      finishReason: string
      rawFinishReason?: string
    }> = []
    let stepCount = 0
    let toolCallsCount = 0
    let toolResultsCount = 0
    let toolErrorsCount = 0

    const result = await streamText({
      model,
      system: systemPrompt,
      messages: lastAIMessages,
      maxOutputTokens: aiAgent.maxOutputTokens,
      temperature: aiAgent.temperature,
      tools,
      toolChoice: Object.keys(tools).length > 0 ? "auto" : "none",
      stopWhen: stepCountIs(5),
      timeout: {
        totalMs: aiTimeouts.aiTotal,
        stepMs: aiTimeouts.aiStep,
        chunkMs: aiTimeouts.aiChunk,
      },
      onStepFinish: ({
        stepNumber,
        finishReason,
        rawFinishReason,
        toolCalls,
        toolResults,
      }) => {
        stepCount = Math.max(stepCount, stepNumber + 1)
        finishReasons.push({
          stepNumber,
          finishReason,
          rawFinishReason,
        })

        toolCallsCount += toolCalls.length
        for (const call of toolCalls) {
          if (call?.toolName) {
            toolNamesSet.add(call.toolName)
          }
        }

        toolResultsCount += toolResults.length
        for (const tr of toolResults as unknown as Array<{
          isError?: boolean
        }>) {
          if (tr?.isError) {
            toolErrorsCount += 1
          }
        }
      },
      experimental_onToolCallFinish: ({
        toolCall,
        durationMs,
        success,
        error,
      }) => {
        if (!success) {
          logger.warn(
            {
              provider,
              modelId: selectedModelId,
              conversationId: message.conversationId,
              workspaceId: message.workspaceId,
              toolName: toolCall?.toolName,
              toolCallId: toolCall?.toolCallId,
              durationMs,
              error,
              errorMessage:
                error instanceof Error ? error.message : String(error),
              errorCause: error instanceof Error ? error.cause : undefined,
              errorStack: error instanceof Error ? error.stack : undefined,
            },
            "[automated-response] tool execution failed",
          )
        }
      },
      abortSignal,
    })

    const { messageCount } = await processStreamingText(
      result.textStream,
      message.conversationId,
      { sendParts: true },
    ).catch((streamError) => {
      logger.error(
        {
          provider,
          modelId: selectedModelId,
          conversationId: message.conversationId,
          error: streamError,
          errorMessage:
            streamError instanceof Error
              ? streamError.message
              : String(streamError),
        },
        "[automated-response] processStreamingText threw error",
      )
      return { messageCount: 0 }
    })

    if (messageCount > 0) {
      return {
        responded: true,
        provider,
        modelId: selectedModelId,
        usedFallbackText: false,
        toolStats: {
          steps: stepCount,
          toolCallsCount,
          toolResultsCount,
          toolErrorsCount,
          toolNames: Array.from(toolNamesSet).slice(0, 10),
          finishReasons: finishReasons.slice(0, 10),
        },
      }
    }

    // Last-resort fallback: loop finished but no assistant text was produced.
    // Do NOT leak raw tool outputs; ask a clarifying question instead.
    if (toolCallsCount > 0 || toolResultsCount > 0) {
      await sendMessageWithRender(
        message.conversationId,
        helpTexts.fallbackLookup,
      )
      return {
        responded: true,
        provider,
        modelId: selectedModelId,
        usedFallbackText: true,
        toolStats: {
          steps: stepCount,
          toolCallsCount,
          toolResultsCount,
          toolErrorsCount,
          toolNames: Array.from(toolNamesSet).slice(0, 10),
          finishReasons: finishReasons.slice(0, 10),
        },
      }
    }

    return null
  } finally {
    // Parent replyByAI handles global timeout and signal cleanup
  }
}

function appendToolOutputGuard(systemPrompt: string): string {
  return `${systemPrompt}\n\n${helpTexts.toolOutputGuard}`.trim()
}

export type ReplyByAIExecutionResult = {
  responded: boolean
  provider: AIAgentProvider
  modelId: string
  usedFallbackText: boolean
  toolStats: {
    steps: number
    toolCallsCount: number
    toolResultsCount: number
    toolErrorsCount: number
    toolNames: string[]
    finishReasons: Array<{
      stepNumber: number
      finishReason: string
      rawFinishReason?: string
    }>
  }
}
