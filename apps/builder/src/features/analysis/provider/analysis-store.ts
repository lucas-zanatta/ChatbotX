import { createStore } from "zustand/vanilla"

function getDefaultDateRange() {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - 6)

  const fromDate = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
    0,
    0,
    0,
    0,
  )

  const toDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  )

  return {
    from: fromDate.getTime(),
    to: toDate.getTime(),
  }
}

export type AnalysisState = {
  chatbotId: string
  from: number | null
  to: number | null
}

export type AnalysisActions = {
  setRange: (from: number, to: number) => void
}

export type AnalysisStore = AnalysisState & AnalysisActions

export const createAnalysisStore = () => {
  const defaultRange = getDefaultDateRange()

  return createStore<AnalysisStore>((set) => ({
    chatbotId: "",
    from: defaultRange.from,
    to: defaultRange.to,

    setRange: (from: number, to: number) => {
      set({ from, to })
    },
  }))
}
