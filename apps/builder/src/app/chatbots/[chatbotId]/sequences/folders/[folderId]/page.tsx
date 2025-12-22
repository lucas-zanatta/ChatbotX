import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { FolderBreadcrumb } from "@/features/sequences/components/folder-breadcrumb"
import { listSequences } from "@/features/sequences/queries"
import {
  getSequenceFolder,
  listAllSequenceFolders,
  listSequenceFolders,
} from "@/features/sequences/queries/sequence-folders"
import { getSequencesSearchParamsCache } from "@/features/sequences/schemas/get-sequences-schema"
import { SequencesTable } from "@/features/sequences/sequences-table"

export default async function FolderPage(props: {
  params: Promise<{ chatbotId: string; folderId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId, folderId } = await props.params
  const searchParams = await props.searchParams
  const search = getSequencesSearchParamsCache.parse(searchParams)

  const folder = await getSequenceFolder(folderId)

  if (!folder || folder.chatbotId !== chatbotId) {
    notFound()
  }

  // Use depth field from folder to determine if we can create subfolders
  const canCreateFolder = folder.depth < 3

  const [sequences, subfolders, allFolders] = await Promise.all([
    listSequences({
      ...search,
      chatbotId,
      folderId,
    }),
    listSequenceFolders(chatbotId, folderId),
    listAllSequenceFolders(chatbotId),
  ])

  const promises = Promise.resolve([sequences]) as Promise<
    [Awaited<ReturnType<typeof listSequences>>]
  >

  return (
    <div className="space-y-4">
      <FolderBreadcrumb chatbotId={chatbotId} folder={folder} />
      <Suspense>
        <SequencesTable
          allFolders={allFolders}
          canCreateFolder={canCreateFolder}
          currentFolderId={folderId}
          folders={subfolders}
          promises={promises}
        />
      </Suspense>
    </div>
  )
}
