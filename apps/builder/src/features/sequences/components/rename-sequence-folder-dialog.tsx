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
import { Input } from "@aha.chat/ui/components/ui/input"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { renameSequenceFolderAction } from "../actions/rename-sequence-folder.action"

type RenameSequenceFolderDialogProps = {
  chatbotId: string
  folder: {
    id: string
    name: string
  }
  open: boolean
  onClose: () => void
}

export function RenameSequenceFolderDialog({
  chatbotId,
  folder,
  open,
  onClose,
}: RenameSequenceFolderDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [name, setName] = useState(folder.name)
  const [isRenaming, setIsRenaming] = useState(false)

  useEffect(() => {
    setName(folder.name)
  }, [folder.name])

  const handleRename = async () => {
    if (!name.trim()) {
      toast.error(t("sequences.folders.nameRequired"))
      return
    }

    setIsRenaming(true)
    try {
      await renameSequenceFolderAction(chatbotId, {
        folderId: folder.id,
        name: name.trim(),
      })
      toast.success(t("sequences.folders.renamed"))
      onClose()
      router.refresh()
    } catch (error) {
      console.error("Error renaming folder:", error)
      toast.error(t("messages.unknownError"))
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    <Dialog onOpenChange={onClose} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sequences.folders.rename")}</DialogTitle>
          <DialogDescription>
            {t("sequences.folders.renameDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Input
              id="folder-name"
              onChange={(e) => setName(e.target.value)}
              placeholder={t("fields.name.placeholder")}
              value={name}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            {t("actions.cancel")}
          </Button>
          <Button
            className="ml-auto"
            disabled={isRenaming}
            onClick={handleRename}
          >
            {isRenaming ? t("actions.saving") : t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
