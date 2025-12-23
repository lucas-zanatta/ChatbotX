"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { FolderUpIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { SequenceResource } from "../schemas/get-sequences-schema"
import type { SequenceFolder } from "../types"
import { BulkMoveToFolderDialog } from "./bulk-move-to-folder-dialog"

type SequencesTableToolbarActionsProps = {
  table: Table<SequenceResource>
  chatbotId: string
  allFolders: SequenceFolder[]
  onBulkDelete: (sequences: SequenceResource[]) => void
}

export function SequencesTableToolbarActions({
  table,
  chatbotId,
  allFolders,
  onBulkDelete,
}: SequencesTableToolbarActionsProps) {
  const _t = useTranslations()
  const router = useRouter()
  const [showMoveDialog, setShowMoveDialog] = useState(false)

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedSequences = selectedRows.map((row) => row.original)

  if (selectedRows.length === 0) {
    return null
  }

  return (
    <>
      <div className="flex items-center justify-center gap-2">
        <Button
          onClick={() => setShowMoveDialog(true)}
          size="icon"
          variant="outline"
        >
          <FolderUpIcon className="h-5 w-5" />
        </Button>
        <Button
          onClick={() => onBulkDelete(selectedSequences)}
          size="icon"
          variant="outline"
        >
          <Trash2Icon className="h-5 w-5" />
        </Button>
      </div>

      <BulkMoveToFolderDialog
        chatbotId={chatbotId}
        folders={allFolders}
        onClose={() => {
          setShowMoveDialog(false)
        }}
        onSuccess={() => {
          table.toggleAllRowsSelected(false)
          router.refresh()
        }}
        open={showMoveDialog}
        sequences={selectedSequences}
      />
    </>
  )
}
