"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { deleteSequenceFolderAction } from "../actions/delete-sequence-folder.action"

type DeleteSequenceFolderDialogProps = {
  chatbotId: string
  folder: {
    id: string
    name: string
  } | null
  open: boolean
  onClose: () => void
}

export function DeleteSequenceFolderDialog({
  chatbotId,
  folder,
  open,
  onClose,
}: DeleteSequenceFolderDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!folder) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteSequenceFolderAction(chatbotId, { folderId: folder.id })
      toast.success(t("sequences.folderDeleted"))
      router.refresh()
      onClose()
    } catch (error) {
      console.error("Error deleting folder:", error)
      toast.error(t("messages.unknownError"))
    } finally {
      setIsDeleting(false)
    }
  }

  if (!folder) {
    return null
  }

  return (
    <Dialog onOpenChange={onClose} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("actions.delete")}</DialogTitle>
          <DialogDescription>
            {t("sequences.folders.confirmDeleteFolderWithName", {
              name: folder.name,
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            disabled={isDeleting}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            className="ml-auto"
            disabled={isDeleting}
            onClick={handleDelete}
            type="button"
            variant="destructive"
          >
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
