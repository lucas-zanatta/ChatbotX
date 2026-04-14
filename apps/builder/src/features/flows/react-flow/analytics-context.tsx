"use client"

import { createContext, useContext } from "react"

const AnalyticsModeContext = createContext(false)

export const AnalyticsModeProvider = ({
  children,
}: {
  children: React.ReactNode
}) => (
  <AnalyticsModeContext.Provider value={true}>
    {children}
  </AnalyticsModeContext.Provider>
)

export const useAnalyticsMode = () => useContext(AnalyticsModeContext)
