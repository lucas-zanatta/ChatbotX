import { buildContext, type IntegrationContext } from "@chatbotx.io/business"
import { db, eq, sql } from "@chatbotx.io/database/client"
import { attachmentModel } from "@chatbotx.io/database/schema"
import {
  getWhatsappClient,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import { SdkException } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import type { IntegrationJobCoexistAttachmentDownload } from "@chatbotx.io/worker-config"
import imageSize from "image-size"
import { logger } from "../../../lib/logger"

/** `Attachment.originPath` carries a pending sentinel until the bytes land in
 *  object storage. Two shapes are emitted by the historical importers:
 *
 *  - `http(s)://…`           — Messenger Graph file URL (short-lived)
 *  - `wa-media:<mediaId>`    — WhatsApp Coexistence media-id (need extra hop)
 *
 *  Anything else is a finalized S3 path and the download has already completed.
 */
const WA_MEDIA_PREFIX = "wa-media:"

const isPendingOriginPath = (path: string): boolean =>
  path.startsWith("http://") ||
  path.startsWith("https://") ||
  path.startsWith(WA_MEDIA_PREFIX)

type DownloadedMedia = {
  bytes: ArrayBuffer
  mimeType: string
  size: number
}

const downloadMessengerMedia = async (
  url: string,
  accessToken: string,
  fallbackMime: string,
): Promise<DownloadedMedia> => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "node",
    },
  })
  if (!(response.ok && response.body)) {
    throw new SdkException(
      `[coexist-attachment] Messenger fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const bytes = await response.arrayBuffer()
  return {
    bytes,
    mimeType: response.headers.get("content-type") ?? fallbackMime,
    size: Number.parseInt(response.headers.get("content-length") ?? "0", 10),
  }
}

const downloadWhatsappMedia = async (
  mediaId: string,
  ctx: IntegrationContext<WhatsappAuthValue>,
  fallbackMime: string,
): Promise<DownloadedMedia> => {
  const client = getWhatsappClient(ctx.auth)
  const meta = await client.retrieveMedia(mediaId)
  if (!("url" in meta && "mime_type" in meta)) {
    throw new SdkException(
      `[coexist-attachment] WhatsApp retrieveMedia returned no url for ${mediaId}`,
    )
  }
  const response = await fetch(meta.url, {
    headers: {
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      "User-Agent": "node",
    },
  })
  if (!(response.ok && response.body)) {
    throw new SdkException(
      `[coexist-attachment] WhatsApp media fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const bytes = await response.arrayBuffer()
  return {
    bytes,
    mimeType: meta.mime_type ?? fallbackMime,
    size: Number.parseInt(response.headers.get("content-length") ?? "0", 10),
  }
}

const loadIntegrationRow = async (
  channel: "messenger" | "whatsapp",
  integrationId: string,
): Promise<{ id: string; inboxId: string; auth: unknown } | null> => {
  const table =
    channel === "messenger" ? "IntegrationMessenger" : "IntegrationWhatsapp"
  const result = await db.execute<{
    id: string
    inboxId: string
    auth: unknown
  }>(
    sql`SELECT * FROM ${sql.identifier(table)} WHERE "id" = ${integrationId} LIMIT 1`,
  )
  return result.rows[0] ?? null
}

/**
 * Mirror a Coexist historical attachment's bytes to object storage and
 * persist the resulting path on the `Attachment` row.
 *
 * Two pending shapes are handled (see `isPendingOriginPath`); finalized S3
 * paths short-circuit so retries are no-ops. The UPDATE uses `WHERE id` only
 * — BullMQ `jobId: att-<id>` dedup plus this prefix guard cover idempotency.
 */
export const coexistAttachmentDownload = async (
  data: IntegrationJobCoexistAttachmentDownload["data"],
): Promise<void> => {
  const { attachmentId, workspaceId, channel, integrationId } = data

  const [row] = await db
    .select({
      id: attachmentModel.id,
      originPath: attachmentModel.originPath,
      mimeType: attachmentModel.mimeType,
    })
    .from(attachmentModel)
    .where(eq(attachmentModel.id, attachmentId))
    .limit(1)

  if (!row) {
    logger.warn({ attachmentId }, "[coexist-attachment] row missing — skip")
    return
  }
  if (!isPendingOriginPath(row.originPath)) {
    return
  }

  const integrationRow = await loadIntegrationRow(channel, integrationId)
  if (!integrationRow) {
    logger.warn(
      { channel, integrationId },
      "[coexist-attachment] integration row missing — skip",
    )
    return
  }

  const ctx = await buildContext({
    workspaceId,
    integrationType: channel,
    integration: integrationRow as Parameters<
      typeof buildContext
    >[0]["integration"],
  })

  let media: DownloadedMedia
  try {
    if (channel === "whatsapp") {
      const mediaId = row.originPath.slice(WA_MEDIA_PREFIX.length)
      media = await downloadWhatsappMedia(
        mediaId,
        ctx as unknown as IntegrationContext<WhatsappAuthValue>,
        row.mimeType,
      )
    } else {
      const accessToken = (ctx.auth as { tokens: { accessToken: string } })
        .tokens.accessToken
      media = await downloadMessengerMedia(
        row.originPath,
        accessToken,
        row.mimeType,
      )
    }
  } catch (error) {
    logger.error(
      { error, attachmentId, channel },
      "[coexist-attachment] download failed",
    )
    throw error
  }

  const newOriginPath = `${ctx.storagePrefix}/${createId()}`
  await ctx.uploader?.putObject(newOriginPath, Buffer.from(media.bytes), {
    ACL: "public-read",
    ContentLength: media.size,
    ContentType: media.mimeType,
  })

  let width: number | undefined
  let height: number | undefined
  if (media.mimeType.startsWith("image/")) {
    try {
      const dims = imageSize(new Uint8Array(media.bytes))
      width = dims.width
      height = dims.height
    } catch (error) {
      logger.warn(
        { error, attachmentId },
        "[coexist-attachment] imageSize failed — skipping dimensions",
      )
    }
  }

  await db
    .update(attachmentModel)
    .set({
      originPath: newOriginPath,
      mimeType: media.mimeType,
      size: media.size,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      updatedAt: new Date(),
    })
    .where(eq(attachmentModel.id, attachmentId))
}
