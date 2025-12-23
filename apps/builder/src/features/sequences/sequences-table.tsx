"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { Badge } from "@aha.chat/ui/components/ui/badge"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { Input } from "@aha.chat/ui/components/ui/input"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { ColumnDef, Row } from "@tanstack/react-table"
import {
  CheckCircleIcon,
  FolderIcon,
  MoreHorizontalIcon,
  PauseCircleIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useQueryState } from "nuqs"
import React, { useMemo, useState } from "react"
import { toast } from "sonner"
import type { listSequences } from "@/features/sequences/queries"
import { toggleSequenceStatusAction } from "./actions/toggle-sequence-status.action"
import { BulkDeleteSequenceDialog } from "./bulk-delete-sequence-dialog"
import { MoveToFolderDialog } from "./components/move-to-folder-dialog"
import { SequenceFoldersGrid } from "./components/sequence-folders-grid"
import { SequencesTableToolbarActions } from "./components/sequences-table-toolbar-actions"
import { DeleteSequenceDialog } from "./delete-sequence-dialog"
import { RenameSequenceDialog } from "./rename-sequence-dialog"
import type { SequenceResource } from "./schemas/get-sequences-schema"

type SequencesTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listSequences>>]>
  folders?: any[]
  allFolders?: any[]
  onSelectFolder?: (folderId: string | null) => void
  selectedFolderId?: string | null
  currentFolderId?: string | null
  canCreateFolder?: boolean
}

export function SequencesTable({
  promises,
  folders = [],
  allFolders = [],
  onSelectFolder,
  selectedFolderId,
  currentFolderId,
  canCreateFolder,
}: SequencesTableProps) {
  const [{ data: initialData, pageCount: initialPageCount }] =
    React.use(promises)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const t = useTranslations()
  const router = useRouter()

  const [rowAction, setRowAction] = useState<{
    row: Row<SequenceResource>
    variant: "rename" | "move" | "delete"
  } | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [nameFilter, setNameFilter] = useQueryState("name", {
    defaultValue: "",
    throttleMs: 300,
    shallow: false,
  })
  const [bulkDeleteSequences, setBulkDeleteSequences] = useState<
    SequenceResource[]
  >([])

  const handleToggleStatus = async (sequence: SequenceResource) => {
    try {
      await toggleSequenceStatusAction(chatbotId, {
        sequenceId: sequence.id,
        active: !sequence.active,
      })
      toast.success(
        t(sequence.active ? "sequences.deactivated" : "sequences.activated"),
      )
      router.refresh()
    } catch (_error) {
      toast.error(t("messages.unknownError"))
    }
  }

  const columns = useMemo<ColumnDef<SequenceResource>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            className="translate-y-0.5 cursor-default"
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            className="translate-y-0.5 cursor-default"
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <div className="flex justify-start">
            <Link
              className="font-medium text-primary hover:underline"
              href={`/chatbots/${chatbotId}/sequences/${row.original.id}`}
            >
              {row.original.name ?? ""}
            </Link>
          </div>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.placeholder"),
          variant: "text",
        },
        size: 300,
        enableSorting: true,
      },
      {
        id: "subscribers",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title="Subscribers"
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">
            {row.original._count?.contactsOnSequences ?? 0}
          </div>
        ),
      },
      {
        id: "messages",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title="Messages"
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">{row.original.messages ?? 0}</div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title="Status"
          />
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            {row.original.active ? (
              <Badge variant="default">Active</Badge>
            ) : (
              <Badge variant="outline">Inactive</Badge>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <div className="w-full text-center">Actions</div>,
        cell: ({ row }) => (
          <div className="flex justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost">
                  <MoreHorizontalIcon className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handleToggleStatus(row.original)}
                >
                  {row.original.active ? (
                    <>
                      <PauseCircleIcon className="mr-2" />
                      {t("actions.deactivate")}
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="mr-2" />
                      {t("actions.activate")}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, variant: "rename" })}
                >
                  <PencilIcon className="mr-2" />
                  {t("actions.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, variant: "move" })}
                >
                  <FolderIcon className="mr-2" />
                  {t("sequences.folders.moveToFolder")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, variant: "delete" })}
                >
                  <TrashIcon className="mr-2" />
                  {t("actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t, chatbotId, handleToggleStatus],
  )

  const { table } = useDataTable({
    data: initialData,
    columns,
    pageCount: initialPageCount,
  })

  const createUrl = currentFolderId
    ? `/chatbots/${chatbotId}/sequences/create?folderId=${currentFolderId}`
    : `/chatbots/${chatbotId}/sequences/create`

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <div className="flex w-full items-center justify-between">
            <Button asChild size="sm">
              <Link href={createUrl}>
                <PlusIcon />
                {t("actions.createFeature", {
                  feature: t("fields.sequences.label"),
                })}
              </Link>
            </Button>
          </div>
        </DataTableToolbar>

        <div className="mt-5 mb-5">
          <SequenceFoldersGrid
            canCreateFolder={canCreateFolder}
            chatbotId={chatbotId}
            currentFolderId={currentFolderId ?? selectedFolderId ?? null}
            folders={folders}
          />
        </div>

        {table.getFilteredSelectedRowModel().rows.length > 0 && (
          <div className="mt-5 mb-5">
            <SequencesTableToolbarActions
              allFolders={allFolders}
              chatbotId={chatbotId}
              onBulkDelete={(sequences: SequenceResource[]) =>
                setBulkDeleteSequences(sequences)
              }
              table={table}
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-end">
            {showSearch ? (
              <div className="flex w-1/3 items-center gap-2">
                <Input
                  autoFocus
                  className="h-8"
                  onChange={(event) => setNameFilter(event.target.value)}
                  placeholder={t("fields.name.placeholder")}
                  value={nameFilter}
                />
                <XIcon
                  className="cursor-pointer text-muted-foreground hover:text-primary"
                  onClick={() => {
                    setShowSearch(false)
                    setNameFilter("")
                  }}
                  size={20}
                />
              </div>
            ) : (
              <SearchIcon
                className="cursor-pointer text-muted-foreground hover:text-primary"
                onClick={() => setShowSearch(true)}
                size={20}
              />
            )}
          </div>
        </div>
      </DataTable>

      <RenameSequenceDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "rename"}
        sequence={rowAction?.row.original || null}
      />

      <MoveToFolderDialog
        chatbotId={chatbotId}
        folders={allFolders.length > 0 ? allFolders : folders}
        onClose={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
        sequence={rowAction?.row.original || { id: "", name: "" }}
      />

      <DeleteSequenceDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "delete"}
        sequence={rowAction?.row.original || null}
      />

      <BulkDeleteSequenceDialog
        onOpenChange={() => {
          setBulkDeleteSequences([])
          table.toggleAllRowsSelected(false)
        }}
        onSuccess={() => {
          setBulkDeleteSequences([])
          table.toggleAllRowsSelected(false)
          router.refresh()
        }}
        open={bulkDeleteSequences.length > 0}
        sequences={bulkDeleteSequences}
      />
    </>
  )
}
