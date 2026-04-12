import { aiProviders } from "@chatbotx.io/ai"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { defaultImageModelIds } from "./ai-shared"

import { stepTypes } from "./step-action"

export const aiGenerateImageQuality = z.enum(["auto", "hd", "md", "ld"])
export type AIGenerateImageQualityType = z.infer<typeof aiGenerateImageQuality>

export const imageAspectRatio = z.enum([
  "auto",
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
])
export type ImageAspectRatioType = z.infer<typeof imageAspectRatio>

export const IMAGE_AUTO_VALUE = imageAspectRatio.enum.auto

export const IMAGE_BASE64_ENCODING = "base64" as const

export const IMAGE_DEFAULT_EXTENSION = "png" as const

export const IMAGE_DEFAULT_MIME_TYPE = "image/png" as const

export const getAIGeneratedImagePath = (
  workspaceId: string,
  fileName: string,
): string => `public/space/${workspaceId}/ai-generated-images/${fileName}`

export const aiGenerateImageProviders = z.enum([
  aiProviders.enum.openai,
  aiProviders.enum.gemini,
])
export type AIGenerateImageProvider = z.infer<typeof aiGenerateImageProviders>

export const openAIImageModelNames = {
  gptImage1: "gpt-image-1",
  dalle3: "dall-e-3",
  dalle2: "dall-e-2",
} as const

export const openAIDalle3Quality = z.enum(["standard", "hd"])
export type OpenAIDalle3Quality = z.infer<typeof openAIDalle3Quality>

export const aiGenerateImageSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiGenerateImage),
  provider: aiGenerateImageProviders,
  model: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  quality: aiGenerateImageQuality,
  size: z.string().trim().min(1),
  outputCfId: z.string().trim().min(1),
})

export type AIGenerateImageSchema = z.infer<typeof aiGenerateImageSchema>

export const aiGenerateImageDefaultFn = (
  props: Partial<AIGenerateImageSchema> = {},
): AIGenerateImageSchema => {
  const provider = props.provider ?? aiGenerateImageProviders.enum.openai
  const model =
    props.model ??
    defaultImageModelIds[provider as keyof typeof defaultImageModelIds] ??
    "dall-e-3"

  return {
    id: createId(),
    provider,
    model,
    prompt: "",
    size: imageAspectRatio.enum.auto,
    quality: aiGenerateImageQuality.enum.auto,
    outputCfId: "",
    ...props,
    stepType: stepTypes.enum.aiGenerateImage,
  }
}
