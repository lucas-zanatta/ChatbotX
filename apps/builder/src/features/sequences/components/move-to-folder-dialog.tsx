"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import {
  RadioGroup,
  RadioGroupItem,
} from "@aha.chat/ui/components/ui/radio-group"
import { ChevronRightIcon, FolderIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { useState } from "react"
import { toast } from "sonner"
import { moveSequenceToFoldersAction } from "../actions/move-sequence-to-folders.action"

type Folder = {
  id: string
  name: string
  depth?: number
  parentId?: string | null
  children?: Folder[]
}

type MoveToFolderDialogProps = {
  chatbotId: string
  sequence: {
    id: string
    name: string
    sequencesOnFolders?: Array<{ folderId: string }>
  }
  folders: Folder[]
  open: boolean
  onClose: () => void
}

export function MoveToFolderDialog({
  chatbotId,
  sequence,
  folders,
  open,
  onClose,
}: MoveToFolderDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const currentFolderId = React.useMemo(
    () => sequence.sequencesOnFolders?.[0]?.folderId || null,
    [sequence],
  )

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    currentFolderId,
  )
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    new Set(),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  React.useEffect(() => {
    if (open) {
      setSelectedFolderId(currentFolderId)

      if (currentFolderId && folders.length > 0) {
        const parentIds = new Set<string>()
        const findParents = (folderId: string) => {
          const folder = folders.find((f) => f.id === folderId)
          if (folder?.parentId) {
            parentIds.add(folder.parentId)
            findParents(folder.parentId)
          }
        }
        findParents(currentFolderId)
        setExpandedFolderIds(parentIds)
      }
    }
  }, [open, currentFolderId, folders])

  const folderTree = React.useMemo(() => {
    if (!folders || folders.length === 0) {
      return []
    }

    const folderMap = new Map<string, Folder & { children: Folder[] }>()
    for (const f of folders) {
      folderMap.set(f.id, { ...f, children: [] })
    }

    const rootFolders: Folder[] = []
    for (const folder of folders) {
      const node = folderMap.get(folder.id)
      if (!node) {
        // Skip if node doesn't exist (shouldn't happen but safer)
        continue
      }
      if (folder.parentId) {
        const parent = folderMap.get(folder.parentId)
        if (parent) {
          parent.children.push(node)
        } else {
          rootFolders.push(node)
        }
      } else {
        rootFolders.push(node)
      }
    }

    return rootFolders
  }, [folders])

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const handleRadioChange = (folderId: string) => {
    setSelectedFolderId(folderId)

    const parentIds = new Set(expandedFolderIds)
    const findParents = (id: string) => {
      const folderItem = folders.find((f) => f.id === id)
      if (folderItem?.parentId) {
        parentIds.add(folderItem.parentId)
        findParents(folderItem.parentId)
      }
    }
    findParents(folderId)
    setExpandedFolderIds(parentIds)
  }

  const handleSave = async () => {
    setIsSubmitting(true)
    try {
      await moveSequenceToFoldersAction(chatbotId, {
        sequenceId: sequence.id,
        folderIds: selectedFolderId ? [selectedFolderId] : [],
      })

      toast.success(t("sequences.folders.movedToFolder"))
      router.refresh()
      onClose()
    } catch (error) {
      console.error("Error moving sequence:", error)
      toast.error(t("messages.unknownError"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setSelectedFolderId(currentFolderId)
    onClose()
  }

  const renderFolderTree = (folderList: Folder[], level = 0) =>
    folderList.map((folder) => {
      const hasChildren = folder.children && folder.children.length > 0
      const isExpanded = expandedFolderIds.has(folder.id)
      const _isSelected = selectedFolderId === folder.id

      return (
        <div
          className="select-none"
          key={folder.id}
          style={{ marginLeft: `${level * 20}px` }}
        >
          <div className="mb-1 flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted/50">
            <FolderIcon className="h-4 w-4 text-muted-foreground" />

            <button
              className="flex-1 cursor-pointer text-left text-sm"
              onClick={() => hasChildren && toggleFolder(folder.id)}
              type="button"
            >
              <button
                className="hover:text-primary hover:underline"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRadioChange(folder.id)
                }}
                type="button"
              >
                {folder.name}
              </button>
              {hasChildren && (
                <span className="ml-2 text-muted-foreground text-xs">
                  ({folder.children?.length})
                </span>
              )}
            </button>

            {hasChildren && (
              <button
                className="rounded p-0.5 hover:bg-muted"
                onClick={() => toggleFolder(folder.id)}
                type="button"
              >
                <ChevronRightIcon
                  className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                />
              </button>
            )}

            <RadioGroupItem
              className="h-4 w-4 cursor-pointer"
              disabled={isSubmitting}
              id={folder.id}
              onClick={(e) => {
                if (selectedFolderId === folder.id) {
                  e.preventDefault()
                  setSelectedFolderId(null)
                }
              }}
              value={folder.id}
            />
          </div>

          {hasChildren && (
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              {renderFolderTree(folder.children || [], level + 1)}
            </div>
          )}
        </div>
      )
    })

  return (
    <Dialog onOpenChange={onClose} open={open}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="border-border border-b px-6 pt-4 pb-5">
          <DialogTitle>{t("sequences.folders.moveToFolder")}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {folderTree.length > 0 ? (
            <RadioGroup
              className="gap-1"
              onValueChange={handleRadioChange}
              value={selectedFolderId || ""}
            >
              {renderFolderTree(folderTree)}
            </RadioGroup>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {t("sequences.folders.noFolder")}
            </div>
          )}
        </div>

        <DialogFooter className="border-border border-t px-6 pt-4 pb-4">
          <Button onClick={handleCancel} type="button" variant="outline">
            {t("actions.cancel")}
          </Button>
          <Button
            className="ml-auto"
            disabled={isSubmitting}
            onClick={handleSave}
            type="button"
          >
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
