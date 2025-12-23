"use client"

import { useRouter, useSearchParams } from "next/navigation"
import React, { useState } from "react"
import type { listSequences } from "../queries"
import type {
  listAllSequenceFolders,
  listSequenceFolders,
} from "../queries/sequence-folders"
import { SequencesTable } from "../sequences-table"

type SequencesWithFoldersProps = {
  promises: Promise<
    [
      Awaited<ReturnType<typeof listSequences>>,
      Awaited<ReturnType<typeof listSequenceFolders>>,
      Awaited<ReturnType<typeof listAllSequenceFolders>>,
    ]
  >
  chatbotId: string
}

export function SequencesWithFolders({
  promises,
  chatbotId,
}: SequencesWithFoldersProps) {
  const [sequencesData, foldersData, allFolders] = React.use(promises)
  const searchParams = useSearchParams()
  const router = useRouter()

  const initFolderId = searchParams.get("folder_id") || null

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    initFolderId,
  )

  const filteredSequences = selectedFolderId
    ? sequencesData.data.filter((seq) =>
        seq.sequencesOnFolders?.some(
          (sof) => sof.folderId === selectedFolderId,
        ),
      )
    : sequencesData.data

  const filteredData = {
    data: filteredSequences,
    pageCount: Math.ceil(filteredSequences.length / 10),
  }

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId)

    const params = new URLSearchParams(searchParams.toString())

    if (folderId) {
      params.set("folder_id", folderId)
    } else {
      params.delete("folder_id")
    }

    const queryString = params.toString()
    const url = queryString ? `?${queryString}` : "?"

    router.replace(url, { scroll: false })
  }

  return (
    <SequencesTable
      allFolders={allFolders}
      folders={foldersData}
      onSelectFolder={handleSelectFolder}
      promises={Promise.all([Promise.resolve(filteredData)])}
      selectedFolderId={selectedFolderId}
    />
  )
}
