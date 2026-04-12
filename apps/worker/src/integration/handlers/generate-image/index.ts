import type {
  IntegrationGeminiModel,
  IntegrationOpenAIModel,
} from "@chatbotx.io/database/types"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import { uploader } from "@chatbotx.io/filesystem"
import {
  type AIGenerateImageSchema,
  aiProviders,
  getAIGeneratedImagePath,
  IMAGE_AUTO_VALUE,
  IMAGE_BASE64_ENCODING,
  IMAGE_DEFAULT_EXTENSION,
  IMAGE_DEFAULT_MIME_TYPE,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { generateImage, type ImageModel } from "ai"
import { normalizeError } from "universal-error-normalizer"
import {
  getAIIntegrationInDB,
  getAIModel,
  normalizeAIModelId,
} from "../../../lib/ai"
import { logger } from "../../../lib/logger"
import { saveResultToCustomField } from "../contact"
import type { ExecuteStepProps } from "../flow"

type ImageModelFactory = { image: (modelId: string) => ImageModel }

const createImageModel = (props: {
  integration: IntegrationOpenAIModel | IntegrationGeminiModel
  provider: AIGenerateImageSchema["provider"]
  modelId: string
}): ImageModel => {
  const normalizedModelId = normalizeAIModelId(props.modelId)
  if (props.provider === aiProviders.enum.openai) {
    return (
      getAIModel(
        props.integration,
        aiProviders.enum.openai,
      ) as ImageModelFactory
    ).image(normalizedModelId)
  }
  return (
    getAIModel(props.integration, aiProviders.enum.gemini) as ImageModelFactory
  ).image(normalizedModelId)
}

export async function handleAIGenerateImage({
  conversation,
  step,
}: ExecuteStepProps<AIGenerateImageSchema>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  try {
    const aiConfig = await getAIIntegrationInDB({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      return
    }

    const model = createImageModel({
      integration: aiConfig,
      provider: step.provider,
      modelId: step.model,
    })

    const size =
      step.provider === aiProviders.enum.openai &&
      step.size !== IMAGE_AUTO_VALUE
        ? (step.size as `${number}x${number}`)
        : undefined

    const aspectRatio =
      step.provider === aiProviders.enum.gemini &&
      step.size !== IMAGE_AUTO_VALUE
        ? (step.size as `${number}:${number}`)
        : undefined

    const { image } = await generateImage({
      model,
      prompt: step.prompt,
      size,
      aspectRatio,
      abortSignal: controller.signal,
    })

    const buffer =
      image.uint8Array.byteLength > 0
        ? Buffer.from(image.uint8Array)
        : Buffer.from(image.base64, IMAGE_BASE64_ENCODING)

    if (buffer.length === 0) {
      throw new Error("[ai-generate-image] Empty image payload from provider")
    }

    const contentType = image.mediaType || IMAGE_DEFAULT_MIME_TYPE
    const extension = contentType.split("/")[1] || IMAGE_DEFAULT_EXTENSION
    const fileName = `${createId()}.${extension}`
    const storagePath = getAIGeneratedImagePath(
      conversation.workspaceId,
      fileName,
    )

    await uploader.putObject(storagePath, buffer, {
      ContentType: contentType,
    })

    const finalImageUrl = getPublicUrl(storagePath)

    if (finalImageUrl && step.outputCfId) {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputCfId,
        fullText: finalImageUrl,
        messageCount: 1,
        workspaceId: conversation.workspaceId,
      })
    }
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(parsedError, "[ai-generate-image] Step failed")
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
