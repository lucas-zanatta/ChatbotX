import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { listSequences } from "@/features/sequences/queries"
import { getSequencesSearchParamsCache } from "@/features/sequences/schemas/get-sequences-schema"
import { SequencesTable } from "@/features/sequences/sequences-table"

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
  ])

  return (
    <Suspense>
      <SequencesTable promises={promises} />
    </Suspense>
  )
}
