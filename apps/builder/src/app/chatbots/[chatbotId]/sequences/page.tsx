import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { SequencesWithFolders } from "@/features/sequences/components/sequences-with-folders"
import { listSequences } from "@/features/sequences/queries"
import {
  listAllSequenceFolders,
  listSequenceFolders,
} from "@/features/sequences/queries/sequence-folders"
import { getSequencesSearchParamsCache } from "@/features/sequences/schemas/get-sequences-schema"

export default async function SequencesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams
  const search = getSequencesSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listSequences({
      ...search,
      chatbotId,
    }),
    listSequenceFolders(chatbotId),
    listAllSequenceFolders(chatbotId),
  ])

  return (
    <Suspense>
      <SequencesWithFolders chatbotId={chatbotId} promises={promises} />
    </Suspense>
  )
}
