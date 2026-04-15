import type {
  BotMessageAIProviderStats,
  BotMessageStats,
  ContactCountsSchema,
  ContactsByDimension,
  ConversationArchivedStats,
  ConversationAssignedByAdminStats,
  ConversationAssignedStats,
  ConversationFollowUpStats,
  ConversationHandoffStats,
  FlowNodeContactData,
  GetBotMessagesAIProvidersResponseSchema,
  GetContactCountsResponseSchema,
  GetContactsByDimensionStatsResponseSchema,
  GetContactsCountResponseSchema,
  GetConversationArchivedResponse,
  GetConversationAssignedByAdminResponse,
  GetConversationAssignedResponse,
  GetConversationFollowUpsResponse,
  GetConversationHandoffsResponse,
  GetMessagesBySenderStatsResponseSchema,
  GetMessagesStatsResponseSchema,
  GetUniqueConversationsByAdminResponse,
  HumanAgentStats,
  MagicLinkTimeseriesRow,
  MessagesByAdminStats,
  MessagesBySenderStats,
  UniqueConversationsByAdminStats,
} from "@chatbotx.io/analytics"
import type { ReflinkModel } from "@chatbotx.io/database/types"
import { endOfToday, startOfToday, subDays } from "date-fns"
import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type {
  GetHumanAgentStatsResponseSchema,
  GetMessagesByAdminStatsResponseSchema,
} from "../../../analytics/src/schemas/contact-stats"

export type AnalysisState = {
  loading: boolean
  errors: Map<string, string>

  type: "dashboard" | "reflinks"
  defaultSearchParams: { [x: string]: string }
  from: Date
  to: Date

  // stats
  contactCounts: ContactCountsSchema[]
  newContactCounts: ContactCountsSchema[]
  inboxTotalContacts: number
  inboxNewContacts: number
  inboxActiveContacts: number
  botMessagesByResult: BotMessageStats[]
  botMessagesAIProviders: BotMessageAIProviderStats[]
  messagesBySender: MessagesBySenderStats[]
  contactsByChannel: ContactsByDimension[]
  contactsByCountry: ContactsByDimension[]
  contactsBySource: ContactsByDimension[]
  conversationHandoffs: ConversationHandoffStats[]
  conversationFollowUps: ConversationFollowUpStats[]
  conversationArchived: ConversationArchivedStats[]
  conversationAssigned: ConversationAssignedStats[]
  conversationAssignedByAdmin: ConversationAssignedByAdminStats[]
  uniqueConversationsByAdmin: UniqueConversationsByAdminStats[]
  messagesByAdmin: MessagesByAdminStats[]
  botMessagesWithResponse: BotMessageStats[]
  botMessagesNoResponse: BotMessageStats[]
  humanAgentStats: HumanAgentStats[]

  refLink?: ReflinkModel
  refLinkStats: MagicLinkTimeseriesRow[]
  reflinkContacts: FlowNodeContactData[]
  reflinkContactsPage: number
  reflinkContactsPageCount: number
  reflinkContactsTotal: number
  reflinkContactsPerPage: number
}

export type AnalysisActions = {
  handleError: (action: string, error: unknown) => void
  initialize: () => Promise<void>
  setRange: (props: { from: Date; to: Date }) => Promise<void>
  loadAnalysisData: () => Promise<void>

  getContactCounts: () => Promise<void>
  getNewContactCounts: () => Promise<void>
  getInboxTotalContacts: () => Promise<void>
  getInboxNewContacts: () => Promise<void>
  getInboxActiveContacts: () => Promise<void>
  getBotMessagesByResult: () => Promise<void>
  getBotMessagesAIProviders: () => Promise<void>
  getMessagesBySender: () => Promise<void>
  getContactsByChannel: () => Promise<void>
  getContactsByCountry: () => Promise<void>
  getContactsBySource: () => Promise<void>
  getConversationHandoffs: () => Promise<void>
  getConversationFollowUps: () => Promise<void>
  getConversationArchived: () => Promise<void>
  getConversationAssigned: () => Promise<void>
  getConversationAssignedByAdmin: () => Promise<void>
  getUniqueConversationsByAdmin: () => Promise<void>
  getMessagesByAdmin: () => Promise<void>
  getBotMessagesWithResponse: () => Promise<void>
  getBotMessagesNoResponse: () => Promise<void>
  getHumanAgentStats: () => Promise<void>

  getRefLink: () => Promise<ReflinkModel | undefined>
  getMagicLinkStatsByDateRange: () => Promise<void>
  getMagicLinkContacts: () => Promise<void>
  setReflinkContactsPage: (page: number) => Promise<void>
}

export type AnalysisStore = AnalysisState & AnalysisActions

export const createAnalysisStore = (props: Partial<AnalysisState>) =>
  createStore<AnalysisStore>((set, get) => ({
    loading: false,
    errors: new Map<string, string>(),
    type: "dashboard",

    // Default option is last 7 days
    defaultSearchParams: {},
    from: subDays(startOfToday(), 7),
    to: endOfToday(),
    ...props,

    // Default stats
    contactCounts: [],
    newContactCounts: [],
    inboxTotalContacts: 0,
    inboxNewContacts: 0,
    inboxActiveContacts: 0,
    botMessagesByResult: [],
    botMessagesAIProviders: [],
    messagesBySender: [],
    contactsByChannel: [],
    contactsByCountry: [],
    contactsBySource: [],
    conversationHandoffs: [],
    conversationFollowUps: [],
    conversationArchived: [],
    conversationAssigned: [],
    conversationAssignedByAdmin: [],
    uniqueConversationsByAdmin: [],
    messagesByAdmin: [],
    botMessagesWithResponse: [],
    botMessagesNoResponse: [],
    humanAgentStats: [],

    refLink: undefined,
    refLinkStats: [],
    reflinkContacts: [],
    reflinkContactsPage: 1,
    reflinkContactsPageCount: 1,
    reflinkContactsTotal: 0,
    reflinkContactsPerPage: 20,

    initialize: async () => {
      const { loadAnalysisData } = get()
      await loadAnalysisData()
    },

    handleError: (action: string, error: unknown) => {
      const { errors } = get()
      if (error instanceof HTTPError) {
        set({ errors: errors.set(action, error.message) })
      } else {
        set({
          errors: errors.set(
            action,
            "An unexpected error occurred. Please contact admin",
          ),
        })
      }
    },

    loadAnalysisData: async () => {
      const {
        type,
        getContactCounts,
        getNewContactCounts,
        getInboxTotalContacts,
        getInboxNewContacts,
        getInboxActiveContacts,
        getBotMessagesByResult,
        getBotMessagesAIProviders,
        getMessagesBySender,
        getContactsByChannel,
        getContactsByCountry,
        getContactsBySource,
        getConversationHandoffs,
        getConversationFollowUps,
        getConversationArchived,
        getConversationAssigned,
        getConversationAssignedByAdmin,
        getUniqueConversationsByAdmin,
        getMessagesByAdmin,
        getBotMessagesWithResponse,
        getBotMessagesNoResponse,
        getHumanAgentStats,
        getRefLink,
        getMagicLinkStatsByDateRange,
        getMagicLinkContacts,
      } = get()
      set({ loading: true, errors: new Map<string, string>() })

      if (type === "dashboard") {
        await Promise.all([
          getContactCounts(),
          getNewContactCounts(),
          getInboxTotalContacts(),
          getInboxNewContacts(),
          getInboxActiveContacts(),
          getBotMessagesByResult(),
          getBotMessagesAIProviders(),
          getMessagesBySender(),
          getContactsByChannel(),
          getContactsByCountry(),
          getContactsBySource(),
          getConversationHandoffs(),
          getConversationFollowUps(),
          getConversationArchived(),
          getConversationAssigned(),
          getConversationAssignedByAdmin(),
          getUniqueConversationsByAdmin(),
          getMessagesByAdmin(),
          getBotMessagesWithResponse(),
          getBotMessagesNoResponse(),
          getHumanAgentStats(),
        ])
      } else if (type === "reflinks") {
        await Promise.all([
          getRefLink(),
          getMagicLinkStatsByDateRange(),
          getMagicLinkContacts(),
        ])
      }
      set({ loading: false })
    },

    setRange: async (props: { from: Date; to: Date }) => {
      set(props)

      const { loadAnalysisData } = get()
      await loadAnalysisData()
    },

    getContactCounts: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: contactCounts } = await ky
          .get("/api/analytics/contact-counts-per-day", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactCountsResponseSchema>()

        set({ contactCounts })
      } catch (error: unknown) {
        get().handleError("getContactCounts", error)
      }
    },

    getNewContactCounts: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: newContactCounts } = await ky
          .get("/api/analytics/new-contact-counts-per-day", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactCountsResponseSchema>()

        set({ newContactCounts })
      } catch (error: unknown) {
        get().handleError("getNewContactCounts", error)
      }
    },

    getInboxTotalContacts: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/contacts-count", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactsCountResponseSchema>()

        set({ inboxTotalContacts: result.data.count })
      } catch (error: unknown) {
        get().handleError("getInboxTotalContacts", error)
        set({ inboxTotalContacts: 0 })
      }
    },

    getInboxNewContacts: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/new-contacts-count", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactsCountResponseSchema>()

        set({ inboxNewContacts: result.data.count })
      } catch (error: unknown) {
        get().handleError("getInboxNewContacts", error)
        set({ inboxNewContacts: 0 })
      }
    },

    getInboxActiveContacts: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/active-contacts-count", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetContactsCountResponseSchema>()

        set({ inboxActiveContacts: result.data.count })
      } catch (error: unknown) {
        get().handleError("getInboxActiveContacts", error)
        set({ inboxActiveContacts: 0 })
      }
    },

    getBotMessagesByResult: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: botMessagesByResult } = await ky
          .get("/api/analytics/bot-messages-by-result", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              granularity: "day",
            },
          })
          .json<GetMessagesStatsResponseSchema>()

        set({ botMessagesByResult })
      } catch (error: unknown) {
        get().handleError("getBotMessagesByResult", error)
      }
    },

    getBotMessagesAIProviders: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/bot-messages-ai-providers", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetBotMessagesAIProvidersResponseSchema>()

        set({ botMessagesAIProviders: result.data })
      } catch (error: unknown) {
        get().handleError("getBotMessagesAIProviders", error)
      }
    },

    getMessagesBySender: async () => {
      const { defaultSearchParams, from, to } = get()
      try {
        const result = await ky
          .get("/api/analytics/messages-by-sender", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetMessagesBySenderStatsResponseSchema>()

        set({ messagesBySender: result.data })
      } catch (error: unknown) {
        get().handleError("getMessagesBySender", error)
      }
    },

    getContactsByChannel: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/contacts-by-dimension", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              dimension: "channel",
            },
          })
          .json<GetContactsByDimensionStatsResponseSchema>()

        set({ contactsByChannel: result.data })
      } catch (error: unknown) {
        get().handleError("getContactsByChannel", error)
      }
    },

    getContactsByCountry: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/contacts-by-dimension", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              dimension: "country",
            },
          })
          .json<GetContactsByDimensionStatsResponseSchema>()

        set({ contactsByCountry: result.data })
      } catch (error: unknown) {
        get().handleError("getContactsByCountry", error)
      }
    },

    getContactsBySource: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/contacts-by-dimension", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              dimension: "source",
            },
          })
          .json<GetContactsByDimensionStatsResponseSchema>()

        set({ contactsBySource: result.data })
      } catch (error: unknown) {
        get().handleError("getContactsBySource", error)
      }
    },

    getConversationHandoffs: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/conversation-handoffs", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetConversationHandoffsResponse>()

        set({ conversationHandoffs: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationHandoffs", error)
      }
    },

    getConversationFollowUps: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/conversation-followups", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetConversationFollowUpsResponse>()

        set({ conversationFollowUps: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationFollowUps", error)
      }
    },

    getConversationArchived: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/conversation-archived", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetConversationArchivedResponse>()

        set({ conversationArchived: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationArchived", error)
      }
    },

    getConversationAssigned: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/conversation-assigned", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetConversationAssignedResponse>()

        set({ conversationAssigned: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationAssigned", error)
      }
    },

    getConversationAssignedByAdmin: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/conversation-assigned-by-admin", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetConversationAssignedByAdminResponse>()

        set({ conversationAssignedByAdmin: result.data })
      } catch (error: unknown) {
        get().handleError("getConversationAssignedByAdmin", error)
      }
    },

    getUniqueConversationsByAdmin: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/unique-conversations-by-admin", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetUniqueConversationsByAdminResponse>()

        set({ uniqueConversationsByAdmin: result.data })
      } catch (error: unknown) {
        get().handleError("getUniqueConversationsByAdmin", error)
      }
    },

    getMessagesByAdmin: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const result = await ky
          .get("/api/analytics/messages-by-admin", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetMessagesByAdminStatsResponseSchema>()

        set({ messagesByAdmin: result.data })
      } catch (error: unknown) {
        get().handleError("getMessagesByAdmin", error)
      }
    },

    getBotMessagesWithResponse: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: botMessagesWithResponse } = await ky
          .get("/api/analytics/bot-messages-with-response", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              granularity: "day",
            },
          })
          .json<GetMessagesStatsResponseSchema>()

        set({ botMessagesWithResponse })
      } catch (error: unknown) {
        get().handleError("getBotMessagesWithResponse", error)
      }
    },

    getBotMessagesNoResponse: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: botMessagesNoResponse } = await ky
          .get("/api/analytics/bot-messages-no-response", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
              granularity: "day",
            },
          })
          .json<GetMessagesStatsResponseSchema>()

        set({ botMessagesNoResponse })
      } catch (error: unknown) {
        get().handleError("getBotMessagesNoResponse", error)
      }
    },

    getHumanAgentStats: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: humanAgentStats } = await ky
          .get("/api/analytics/human-agent-stats", {
            searchParams: {
              ...defaultSearchParams,
              from: from.toISOString(),
              to: to.toISOString(),
            },
          })
          .json<GetHumanAgentStatsResponseSchema>()

        set({ humanAgentStats })
      } catch (error: unknown) {
        get().handleError("getHumanAgentStats", error)
      }
    },

    getRefLink: async () => {
      const { defaultSearchParams } = get()
      const { workspaceId, linkId } = defaultSearchParams

      try {
        const result = await ky
          .get(`/api/workspaces/${workspaceId}/ref-links/${linkId}`)
          .json<ReflinkModel>()

        set({ refLink: result })
      } catch (error: unknown) {
        get().handleError("getRefLink", error)
      }
    },

    getMagicLinkStatsByDateRange: async () => {
      const { defaultSearchParams, from, to } = get()

      try {
        const { data: refLinkStats } = await ky
          .get("/api/analytics/magic-links-stats", {
            searchParams: {
              ...defaultSearchParams,
              startDate: from.toISOString().split("T")[0],
              endDate: to.toISOString().split("T")[0],
            },
          })
          .json<{ data: MagicLinkTimeseriesRow[] }>()

        set({ refLinkStats })
      } catch (error: unknown) {
        get().handleError("getContactCounts", error)
      }
    },

    getMagicLinkContacts: async () => {
      const {
        defaultSearchParams,
        reflinkContactsPage,
        reflinkContactsPerPage,
      } = get()

      try {
        const result = await ky
          .get("/api/analytics/magic-links-contacts", {
            searchParams: {
              ...defaultSearchParams,
              page: String(reflinkContactsPage),
              perPage: String(reflinkContactsPerPage),
            },
          })
          .json<{
            data: FlowNodeContactData[]
            total: number
            page: number
            pageCount: number
          }>()

        set({
          reflinkContacts: result.data,
          reflinkContactsTotal: result.total,
          reflinkContactsPage: result.page,
          reflinkContactsPageCount: result.pageCount,
        })
      } catch (error: unknown) {
        get().handleError("getMagicLinkContacts", error)
      }
    },

    setReflinkContactsPage: async (page: number) => {
      set({ reflinkContactsPage: page })
      await get().getMagicLinkContacts()
    },
  }))
