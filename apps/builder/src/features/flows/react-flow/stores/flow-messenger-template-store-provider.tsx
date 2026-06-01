"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import {
  createFlowMessengerTemplateStore,
  type FlowMessengerTemplateStore,
} from "./flow-messenger-template-store"

type FlowMessengerTemplateStoreApi = ReturnType<
  typeof createFlowMessengerTemplateStore
>
const FlowMessengerTemplateContext = createContext<
  FlowMessengerTemplateStoreApi | undefined
>(undefined)

export type FlowMessengerTemplateProviderProps = {
  children: ReactNode
  workspaceId: string
  autoInitialize?: boolean
}

export function FlowMessengerTemplateStoreProvider({
  children,
  workspaceId,
  autoInitialize = true,
}: FlowMessengerTemplateProviderProps) {
  const storeRef = useRef<FlowMessengerTemplateStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createFlowMessengerTemplateStore({
      workspaceId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <FlowMessengerTemplateContext.Provider value={storeRef.current}>
      {children}
    </FlowMessengerTemplateContext.Provider>
  )
}

export const useFlowMessengerTemplate = <T,>(
  selector: (store: FlowMessengerTemplateStore) => T,
): T => {
  const context = useContext(FlowMessengerTemplateContext)

  if (!context) {
    throw new Error(
      "useFlowMessengerTemplate must be used within FlowMessengerTemplateStoreProvider",
    )
  }

  return useStore(context, selector)
}
