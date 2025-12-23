"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent, CardTitle } from "@aha.chat/ui/components/ui/card"
import { FolderIcon, PencilIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { CreateSequenceFolderDialog } from "./create-sequence-folder-dialog"
import { DeleteSequenceFolderDialog } from "./delete-sequence-folder-dialog"
import { RenameSequenceFolderDialog } from "./rename-sequence-folder-dialog"

type SequenceFolder = {
  id: string
  name: string
  parentId?: string | null
  _count: {
    sequencesOnFolders: number
    totalSequences: number
    children?: number
  }
}

type SequenceFoldersGridProps = {
  chatbotId: string
  folders: SequenceFolder[]
  currentFolderId?: string | null
  canCreateFolder?: boolean
}

export function SequenceFoldersGrid({
  chatbotId,
  folders,
  currentFolderId,
  canCreateFolder = true,
}: SequenceFoldersGridProps) {
  const _t = useTranslations()
  const [renamingFolder, setRenamingFolder] = useState<SequenceFolder | null>(
    null,
  )
  const [deletingFolder, setDeletingFolder] = useState<SequenceFolder | null>(
    null,
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5">
        {folders.map((folder) => (
          <Link
            href={`/chatbots/${chatbotId}/sequences/folders/${folder.id}`}
            key={folder.id}
          >
            <Card className="group cursor-pointer border border-input py-2 shadow-none transition-colors hover:bg-muted/40">
              <CardContent className="flex min-h-[30px] items-center justify-between gap-1 px-4 py-0">
                <div className="group flex flex-1 items-center gap-1.5 overflow-hidden">
                  <FolderIcon className="h-6 w-6 text-muted-foreground" />
                  <div className="flex-1 overflow-hidden">
                    <CardTitle className="truncate font-medium text-[11px] leading-tight transition-colors group-hover:text-primary">
                      {folder.name}
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground">
                      {folder._count.totalSequences} sequences
                      {folder._count.children
                        ? ` • ${folder._count.children} folders`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    className="h-5 w-5 cursor-pointer p-0 text-muted-foreground transition-colors hover:text-primary"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setRenamingFolder(folder)
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <PencilIcon className="h-2.5 w-2.5" />
                  </Button>
                  <Button
                    className="h-5 w-5 cursor-pointer p-0 text-muted-foreground transition-colors hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setDeletingFolder(folder)
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2Icon className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {canCreateFolder && (
          <CreateSequenceFolderDialog
            chatbotId={chatbotId}
            currentFolderId={currentFolderId}
            variant="card"
          />
        )}
      </div>

      {renamingFolder && (
        <RenameSequenceFolderDialog
          chatbotId={chatbotId}
          folder={renamingFolder}
          onClose={() => setRenamingFolder(null)}
          open={!!renamingFolder}
        />
      )}

      {deletingFolder && (
        <DeleteSequenceFolderDialog
          chatbotId={chatbotId}
          folder={deletingFolder}
          onClose={() => setDeletingFolder(null)}
          open={!!deletingFolder}
        />
      )}
    </div>
  )
}
