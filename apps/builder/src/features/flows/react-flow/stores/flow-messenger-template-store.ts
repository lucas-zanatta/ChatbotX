import { messengerTemplateStatusSchema } from "@chatbotx.io/database/partials"
import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { ListMessengerMessageTemplatesResponse } from "@/features/integration-messenger/message-templates/schema/query"

export type FlowMessengerTemplateState = {
  error: string | null
  initialized: boolean

  workspaceId: string

  loadingMessengerTemplates: boolean
  messengerTemplates: ListMessengerMessageTemplatesResponse
}

export type FlowMessengerTemplateActions = {
  initialize: () => Promise<void>
  fetchMessengerTemplates: () => Promise<void>
}

export type FlowMessengerTemplateStore = FlowMessengerTemplateState &
  FlowMessengerTemplateActions

export const createFlowMessengerTemplateStore = (
  props: Partial<FlowMessengerTemplateState>,
) =>
  createStore<FlowMessengerTemplateStore>((set, get) => ({
    error: null,
    initialized: false,

    workspaceId: "",

    loadingMessengerTemplates: false,
    messengerTemplates: [],

    ...props,

    initialize: async () => {
      const { initialized, workspaceId, fetchMessengerTemplates } = get()

      if (initialized || !workspaceId) {
        return
      }

      try {
        await fetchMessengerTemplates()
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch Messenger templates",
        })
      } finally {
        set({ initialized: true })
      }
    },

    fetchMessengerTemplates: async () => {
      const { workspaceId, loadingMessengerTemplates } = get()

      if (loadingMessengerTemplates) {
        return
      }

      set({ loadingMessengerTemplates: true, error: null })
      try {
        const templates = await ky
          .get<ListMessengerMessageTemplatesResponse>(
            `/api/workspaces/${workspaceId}/messenger-message-templates`,
            {
              searchParams: {
                status: messengerTemplateStatusSchema.enum.APPROVED,
              },
            },
          )
          .json()

        set({
          messengerTemplates: templates,
        })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch Messenger templates",
        })
      } finally {
        set({ loadingMessengerTemplates: false })
      }
    },
  }))
