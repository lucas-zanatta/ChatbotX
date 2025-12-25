import { useMemo } from "react"
import { useSequenceStore } from "./sequence-store-context"

export const useSequenceOptions = (): string[] => {
  const sequences = useSequenceStore((state) => state.sequences)

  return useMemo(() => sequences.map((sequence) => sequence.name), [sequences])
}
