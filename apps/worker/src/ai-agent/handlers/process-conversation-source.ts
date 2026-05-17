import { createHash } from "node:crypto"
import { db, eq } from "@chatbotx.io/database/client"
import {
  aiConversationSourceStatuses,
  aiEmbeddingStatuses,
} from "@chatbotx.io/database/partials"
import {
  aiConversationEmbeddingModel,
  aiConversationSourceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  AI_FILES_DEFAULT_CHUNK_SIZE,
  AI_FILES_DEFAULT_OVERLAP_SIZE,
  AIJobAction,
  type AIJobProcessConversationSource,
  aiAgentQueue,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { withTimeout } from "../lib/async-utils"
import { isSupportedDocumentMimeType } from "../lib/mime-utils"
import { extractTextFromFile } from "../lib/text-extractor"

const MAX_DOCUMENT_TEXT_CHARS = 200_000
const MAX_DOCUMENT_CHUNKS = 120
const PARSE_TIMEOUT_MS = 30_000

type TextChunk = {
  content: string
  chunkIndex: number
}

function splitTextIntoChunks(
  text: string,
  chunkSize = AI_FILES_DEFAULT_CHUNK_SIZE,
  overlapSize = AI_FILES_DEFAULT_OVERLAP_SIZE,
): TextChunk[] {
  const chunks: TextChunk[] = []
  if (!text || chunkSize <= 0) {
    return chunks
  }

  let start = 0
  let chunkIndex = 0
  while (start < text.length && chunks.length < MAX_DOCUMENT_CHUNKS) {
    const end = Math.min(start + chunkSize, text.length)
    const piece = text.slice(start, end).trim()
    if (piece.length > 0) {
      chunks.push({
        content: piece,
        chunkIndex,
      })
      chunkIndex += 1
    }

    if (end === text.length) {
      break
    }

    start = Math.max(0, end - overlapSize)
  }

  return chunks
}

function summarizeText(text: string): string {
  return text.slice(0, 500).trim()
}

export async function processConversationSource(
  data: AIJobProcessConversationSource["data"],
) {
  const source = await db.query.aiConversationSourceModel.findFirst({
    where: {
      id: data.sourceId,
    },
    with: {
      attachment: true,
    },
  })

  if (!source) {
    throw new Error("AI conversation source not found")
  }

  if (source.sourceType !== "document") {
    return
  }

  if (source.status === aiConversationSourceStatuses.enum.success) {
    return
  }

  if (!(source.attachment && source.attachmentId)) {
    await db
      .update(aiConversationSourceModel)
      .set({
        status: aiConversationSourceStatuses.enum.error,
        errorMessage: "Attachment not found for document source",
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))
    return
  }

  const attachment = source.attachment

  if (!isSupportedDocumentMimeType(attachment.mimeType)) {
    await db
      .update(aiConversationSourceModel)
      .set({
        status: aiConversationSourceStatuses.enum.error,
        errorMessage: "Unsupported document mime type",
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))
    return
  }

  await db
    .update(aiConversationSourceModel)
    .set({
      status: aiConversationSourceStatuses.enum.processing,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(aiConversationSourceModel.id, source.id))

  try {
    const extractedText = await withTimeout(
      extractTextFromFile(attachment.originPath, attachment.mimeType),
      PARSE_TIMEOUT_MS,
    )
    const normalizedText = extractedText.slice(0, MAX_DOCUMENT_TEXT_CHARS)
    const trimmedText = normalizedText.trim()

    if (!trimmedText) {
      await db
        .update(aiConversationSourceModel)
        .set({
          status: aiConversationSourceStatuses.enum.error,
          errorMessage: "Unable to extract readable text from document",
          updatedAt: new Date(),
        })
        .where(eq(aiConversationSourceModel.id, source.id))
      return
    }

    const chunks = splitTextIntoChunks(trimmedText)
    const contentHash = createHash("sha256").update(trimmedText).digest("hex")

    const embeddingRows = await db.transaction(async (tx) => {
      await tx
        .delete(aiConversationEmbeddingModel)
        .where(eq(aiConversationEmbeddingModel.sourceId, source.id))

      if (chunks.length === 0) {
        return []
      }

      return tx
        .insert(aiConversationEmbeddingModel)
        .values(
          chunks.map((chunk) => ({
            id: createId(),
            sourceId: source.id,
            workspaceId: source.workspaceId,
            conversationId: source.conversationId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            status: aiEmbeddingStatuses.enum.pending,
          })),
        )
        .returning({
          id: aiConversationEmbeddingModel.id,
        })
    })

    await db
      .update(aiConversationSourceModel)
      .set({
        status: aiConversationSourceStatuses.enum.success,
        contentHash,
        summary: summarizeText(trimmedText),
        metadata: {
          chunkCount: embeddingRows.length,
          maxChunks: MAX_DOCUMENT_CHUNKS,
          maxTextChars: MAX_DOCUMENT_TEXT_CHARS,
        },
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))

    if (embeddingRows.length > 0) {
      await aiAgentQueue.addBulk(
        embeddingRows.map((embedding) => ({
          name: AIJobAction.processConversationSourceEmbedding,
          data: {
            type: AIJobAction.processConversationSourceEmbedding,
            data: {
              conversationEmbeddingId: embedding.id,
            },
          },
        })),
      )
    }
  } catch (error) {
    const normalizedError = normalizeError(error)
    logger.error(
      {
        error: normalizedError,
        sourceId: source.id,
        conversationId: source.conversationId,
        workspaceId: source.workspaceId,
      },
      "[ai-agent] processConversationSource failed",
    )

    await db
      .update(aiConversationSourceModel)
      .set({
        status: aiConversationSourceStatuses.enum.error,
        errorMessage:
          normalizedError.message || "Failed to process conversation source",
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))
  }
}
