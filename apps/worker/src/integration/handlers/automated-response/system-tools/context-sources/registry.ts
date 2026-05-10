import { documentContextSourceAdapter } from "./document-source"
import type {
  ConversationContextSourceAdapter,
  ConversationContextSourceType,
} from "./types"

const contextSourceRegistry: Partial<
  Record<ConversationContextSourceType, ConversationContextSourceAdapter>
> = {
  document: documentContextSourceAdapter,
}

export function getContextSourceAdapter(
  sourceType: ConversationContextSourceType,
): ConversationContextSourceAdapter | null {
  return contextSourceRegistry[sourceType] ?? null
}
