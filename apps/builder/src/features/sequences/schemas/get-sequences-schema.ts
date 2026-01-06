import type { SequenceModel } from "@aha.chat/database/types"
import {
  createSearchParamsCache,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getSequencesSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  active: parseAsBoolean,
})

export type GetSequencesSchema = Awaited<
  ReturnType<typeof getSequencesSearchParamsCache.parse>
> & { chatbotId: string; folderId?: string | null }

export type SequenceResource = SequenceModel & {
  _count?: {
    steps?: number
    contactsOnSequences?: number
  }
  sequencesOnFolders?: {
    folderId: string
    folder: {
      id: string
      name: string
    }
  }[]
}
