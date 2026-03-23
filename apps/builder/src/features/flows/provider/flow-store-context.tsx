"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { createFlowStore, type FlowStore } from "./flow-store"

export type FlowStoreApi = ReturnType<typeof createFlowStore>

export const FlowStoreContext = createContext<FlowStoreApi | undefined>(
  undefined,
)

export type FlowStoreProviderProps = {
  chatbotId: string
  filter?: { startType?: string; integrationWhatsappId?: string }
  children: ReactNode
  autoInitialize?: boolean
}

export const FlowStoreProvider = ({
  chatbotId,
  filter,
  autoInitialize = true,
  children,
}: FlowStoreProviderProps) => {
  const storeRef = useRef<FlowStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createFlowStore({
      chatbotId,
      filter,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  // biome-ignore lint/correctness/useExhaustiveDependencies: project preference
  useEffect(() => {
    if (storeRef.current && filter) {
      storeRef.current.getState().getAllActiveFlows(filter)
    }
  }, [filter?.startType, filter?.integrationWhatsappId])

  return (
    <FlowStoreContext.Provider value={storeRef.current}>
      {children}
    </FlowStoreContext.Provider>
  )
}

export const useFlowStore = <T,>(selector: (store: FlowStore) => T): T => {
  const flowStoreContext = useContext(FlowStoreContext)

  if (!flowStoreContext) {
    throw new Error("useFlowStore must be used within FlowStoreProvider")
  }

  return useStore(flowStoreContext, selector)
}
