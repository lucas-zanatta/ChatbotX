import type { Oauth2AuthValue, Oauth2Config } from "@chatbotx.io/sdk"
import { z } from "zod"

export const INSTAGRAM_MESSAGE_METADATA = "SENT_FROM_CHATBOTX"

export type InstagramConfig = Oauth2Config & {
  verifyToken?: string
  version: string
  stateParams: {
    workspaceId: string
  }
}

export type InstagramAuthValue = Oauth2AuthValue & {
  metadata: {
    igId: string
    igName: string
    pageId: string
    version: string
  }
}

export type InstagramActions = Record<string, never>

// Common attachment types
const attachmentTypeSchema = z.enum(["image", "video", "audio", "file"])

// Base attachment payload
const baseAttachmentPayloadSchema = z.object({
  url: z.url(),
})

// Common ID schemas
const idSchema = z.object({
  id: z.string(),
})

export const instagramAttachmentSchema = z.object({
  type: attachmentTypeSchema,
  payload: baseAttachmentPayloadSchema,
})
export type InstagramAttachment = z.infer<typeof instagramAttachmentSchema>

export const instagramMessageSchema = z.object({
  mid: z.string(),
  text: z.string().optional(),
  is_echo: z.boolean().optional(),
  attachments: z.array(instagramAttachmentSchema).optional(),
  metadata: z.string().optional(),
  quick_reply: z
    .object({
      payload: z.string(),
    })
    .optional(),
})
export type InstagramMessage = z.infer<typeof instagramMessageSchema>

export const instagramReadSchema = z.object({
  watermark: z.number().optional(),
})

export const instagramPostbackSchema = z.object({
  mid: z.string(),
  title: z.string(),
  payload: z.string(),
})

export const instagramReferralSchema = z.object({
  ref: z.string(),
  source: z.string(),
  type: z.string(),
})
export type InstagramReferral = z.infer<typeof instagramReferralSchema>

export const instagramOptinSchema = z.object({
  ref: z.string().optional(),
  user_ref: z.string().optional(),
})
export type InstagramOptin = z.infer<typeof instagramOptinSchema>

export const instagramMessagingEventSchema = z
  .object({
    sender: idSchema,
    recipient: idSchema,
    timestamp: z.number(),
    message: instagramMessageSchema.optional(),
    read: instagramReadSchema.optional(),
    postback: instagramPostbackSchema.optional(),
    referral: instagramReferralSchema.optional(),
    optin: instagramOptinSchema.optional(),
    reaction: z.record(z.string(), z.unknown()).optional(),
    handover: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
export type InstagramMessagingEvent = z.infer<
  typeof instagramMessagingEventSchema
>

export const instagramCommentChangeSchema = z.object({
  field: z.enum(["comments", "mentions", "live_comments"]),
  value: z.object({
    id: z.string(),
    text: z.string().optional(),
    parent_id: z.string().optional(),
    media: z
      .object({
        id: z.string(),
      })
      .optional(),
    from: z
      .object({
        id: z.string().optional(),
        username: z.string().optional(),
      })
      .optional(),
    media_id: z.string().optional(),
    comment_id: z.string().optional(),
  }),
})
export type InstagramCommentChange = z.infer<
  typeof instagramCommentChangeSchema
>

export const instagramGenericChangeSchema = z.object({
  field: z.enum(["story_insights"]),
  value: z.record(z.string(), z.unknown()).optional(),
})
export type InstagramGenericChange = z.infer<
  typeof instagramGenericChangeSchema
>

export const instagramPageEntrySchema = z
  .object({
    id: z.string(),
    time: z.number(),
    messaging: z.array(instagramMessagingEventSchema).optional(),
    standby: z.array(instagramMessagingEventSchema).optional(),
    changes: z
      .array(
        z.union([instagramCommentChangeSchema, instagramGenericChangeSchema]),
      )
      .optional(),
  })
  .passthrough()
export type InstagramPageEntry = z.infer<typeof instagramPageEntrySchema>

export const instagramWebhookEventSchema = z.object({
  object: z.literal("instagram"),
  entry: z.array(instagramPageEntrySchema),
})
export type InstagramWebhookEvent = z.infer<typeof instagramWebhookEventSchema>

export const instagramQuickReplySchema = z.object({
  content_type: z.enum(["text", "user_phone_number"]),
  title: z.string().optional(),
  payload: z.string().optional(),
  image_url: z.url().optional(),
})
export type InstagramQuickReply = z.infer<typeof instagramQuickReplySchema>

export const instagramButtonSchema = z.object({
  type: z.enum(["web_url", "postback"]),
  title: z.string(),
  url: z.url().optional(),
  payload: z.string().optional(),
})
export type InstagramButton = z.infer<typeof instagramButtonSchema>

export const instagramElementSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  image_url: z.url().optional(),
  default_action: z
    .object({
      type: z.literal("web_url"),
      url: z.url(),
    })
    .optional(),
  buttons: z.array(instagramButtonSchema).max(3).optional(),
})
export type InstagramElement = z.infer<typeof instagramElementSchema>

export const instagramMessageAttachmentPayloadSchema = z.object({
  url: z.url().optional(),
  is_reusable: z.boolean().optional(),
  template_type: z.enum(["generic", "button", "media"]).optional(),
  text: z.string().optional(),
  buttons: z.array(instagramButtonSchema).optional(),
  elements: z.array(instagramElementSchema).optional(),
  attachment_id: z.string().optional(),
})
export type InstagramMessageAttachmentPayload = z.infer<
  typeof instagramMessageAttachmentPayloadSchema
>

export const instagramMessageAttachmentSchema = z.object({
  type: z.enum(["image", "video", "audio", "file", "template"]),
  payload: instagramMessageAttachmentPayloadSchema,
})
export type InstagramMessageAttachment = z.infer<
  typeof instagramMessageAttachmentSchema
>

export const instagramSendMessageSchema = z.object({
  text: z.string().optional(),
  attachment: instagramMessageAttachmentSchema.optional(),
  attachments: z.array(instagramMessageAttachmentSchema).optional(),
  quick_replies: z.array(instagramQuickReplySchema).max(13).optional(),
  metadata: z.string().optional(),
})
export type InstagramSendMessage = z.infer<typeof instagramSendMessageSchema>

export const instagramRecipientSchema = z.object({
  id: z.string(),
})
export type InstagramRecipient = z.infer<typeof instagramRecipientSchema>

export const instagramSendMessageRequestSchema = z.object({
  recipient: instagramRecipientSchema,
  message: instagramSendMessageSchema.optional(),
  sender_action: z.enum(["typing_on", "typing_off", "mark_seen"]).optional(),
  messaging_type: z.literal("RESPONSE").optional(),
})
export type InstagramSendMessageRequest = z.infer<
  typeof instagramSendMessageRequestSchema
>

export const instagramSendMessageResponseSchema = z.object({
  recipient_id: z.string(),
  message_id: z.string().optional(),
  attachment_id: z.string().optional(),
})
export type InstagramSendMessageResponse = z.infer<
  typeof instagramSendMessageResponseSchema
>

export const instagramErrorSchema = z.object({
  message: z.string(),
  type: z.string(),
  code: z.number(),
  error_subcode: z.number().optional(),
  fbtrace_id: z.string().optional(),
})
export type InstagramError = z.infer<typeof instagramErrorSchema>

export const instagramGraphAPIErrorSchema = z.object({
  error: instagramErrorSchema,
})
export type InstagramGraphAPIError = z.infer<
  typeof instagramGraphAPIErrorSchema
>

// Instagram User Profile schema
export const instagramUserProfileSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  profile_pic: z.url().optional(),
  username: z.string().optional(),
})
export type InstagramUserProfile = z.infer<typeof instagramUserProfileSchema>

// Webhook verification schemas
export const webhookVerificationRequestSchema = z.object({
  "hub.mode": z.literal("subscribe"),
  "hub.challenge": z.string(),
  "hub.verify_token": z.string(),
})
export type WebhookVerificationRequest = z.infer<
  typeof webhookVerificationRequestSchema
>

// OAuth and authentication schemas
export const instagramOAuthCallbackSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
})
export type InstagramOAuthCallback = z.infer<
  typeof instagramOAuthCallbackSchema
>

export const instagramAccessTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("bearer"),
  expires_in: z.number().optional(),
  user_id: z.coerce.string().optional(),
})
export type InstagramAccessTokenResponse = z.infer<
  typeof instagramAccessTokenResponseSchema
>

// Select page request schema (for UI)
export const selectPageRequestSchema = z.object({
  pageId: z.string().min(1, "Please select a Facebook page"),
  pageName: z.string().min(1, "Page name is required"),
  accessToken: z.string().min(1, "Page access token is required"),
  igId: z.string().min(1, "Instagram account ID is required"),
  igName: z.string().min(1, "Instagram account name is required"),
})
export type SelectPageRequest = z.infer<typeof selectPageRequestSchema>

export const iceBreakerSchema = z.object({
  locale: z.string(),
  call_to_actions: z.array(
    z.object({
      question: z.string(),
      payload: z.string(),
    }),
  ),
})
export type IceBreaker = z.infer<typeof iceBreakerSchema>

export const persistentMenuSchema = z.object({
  locale: z.string(),
  call_to_actions: z.array(instagramButtonSchema),
})
export type PersistentMenuSchema = z.infer<typeof persistentMenuSchema>

export const instagramProfileRequest = z.object({
  ice_breakers: z.array(iceBreakerSchema),
  persistent_menu: z.array(persistentMenuSchema),
})
export type InstagramProfileRequest = z.infer<typeof instagramProfileRequest>

export type InstagramContactProfile = {
  followersCount: number | null
  followsBusiness: boolean | null
  businessFollowUser: boolean | null
}

export const instagramMediaSchema = z.object({
  id: z.string(),
  caption: z.string().optional(),
  media_type: z.string().optional(),
  media_url: z.url().optional(),
  thumbnail_url: z.url().optional(),
  permalink: z.url().optional(),
  timestamp: z.string().optional(),
})
export type InstagramMedia = z.infer<typeof instagramMediaSchema>

export const instagramMediaListResponseSchema = z.object({
  data: z.array(instagramMediaSchema),
  paging: z
    .object({
      next: z.url().optional(),
    })
    .optional(),
})
export type InstagramMediaListResponse = z.infer<
  typeof instagramMediaListResponseSchema
>
