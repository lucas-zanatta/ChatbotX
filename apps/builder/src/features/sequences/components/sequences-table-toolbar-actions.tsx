"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { FolderIcon, TrashIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { SequenceResource } from "../schemas/get-sequences-schema"
import { BulkMoveToFolderDialog } from "./bulk-move-to-folder-dialog"

type SequencesTableToolbarActionsProps = {
  table: Table<SequenceResource>
  chatbotId: string
  allFolders: any[]
  onBulkDelete: (sequences: SequenceResource[]) => void
}

export function SequencesTableToolbarActions({
  table,
  chatbotId,
  allFolders,
  onBulkDelete,
}: SequencesTableToolbarActionsProps) {
  const t = useTranslations()
  const router = useRouter()
  const [showMoveDialog, setShowMoveDialog] = useState(false)

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedSequences = selectedRows.map((row) => row.original)

  if (selectedRows.length === 0) {
    return null
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {t("messages.selectedCount", { count: selectedRows.length })}
        </span>
        <Button
          onClick={() => setShowMoveDialog(true)}
          size="sm"
          variant="outline"
        >
          <FolderIcon className="mr-2 h-4 w-4" />
          {t("sequences.folders.moveToFolder")}
        </Button>
        <Button
          onClick={() => onBulkDelete(selectedSequences)}
          size="sm"
          variant="outline"
        >
          <TrashIcon className="mr-2 h-4 w-4" />
          {t("actions.delete")}
        </Button>
      </div>

      <BulkMoveToFolderDialog
        chatbotId={chatbotId}
        folders={allFolders}
        onClose={() => {
          setShowMoveDialog(false)
          table.toggleAllRowsSelected(false)
          router.refresh()
        }}
        open={showMoveDialog}
        sequences={selectedSequences}
      />
    </>
  )
}
