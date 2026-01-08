"use client"

import { FolderType } from "@aha.chat/database/types"
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
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { ColumnDef, Row } from "@tanstack/react-table"
import {
  CheckCircleIcon,
  FolderUpIcon,
  MoreHorizontalIcon,
  PauseCircleIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import type { listSequences } from "@/features/sequences/queries"
import { ChangeFolderDialog } from "../folders/change-folder"
import { toggleSequenceStatusAction } from "./actions/toggle-sequence-status.action"
import { BulkDeleteSequenceDialog } from "./bulk-delete-sequence-dialog"
import { DeleteSequenceDialog } from "./delete-sequence-dialog"
import { RenameSequenceDialog } from "./rename-sequence-dialog"
import type { SequenceResource } from "./schemas/get-sequences-schema"

type SequencesTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listSequences>>]>
}

export function SequencesTable({ promises }: SequencesTableProps) {
  const [{ data: initialData, pageCount: initialPageCount }] =
    React.use(promises)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const t = useTranslations()
  const router = useRouter()

  const [rowAction, setRowAction] = useState<{
    row: Row<SequenceResource>
    variant: "rename" | "move" | "delete"
  } | null>(null)

  const [bulkDeleteSequences, setBulkDeleteSequences] = useState<
    SequenceResource[]
  >([])

  const handleToggleStatus = useCallback(
    async (sequence: SequenceResource) => {
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
    },
    [chatbotId, t, router],
  )

  const columns = useMemo<ColumnDef<SequenceResource>[]>(
    () => [
      {
        id: "select",
        header: ({ table: dataTable }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              dataTable.getIsAllPageRowsSelected() ||
              (dataTable.getIsSomePageRowsSelected() && "indeterminate")
            }
            className="translate-y-0.5 cursor-pointer"
            onCheckedChange={(value) =>
              dataTable.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            className="translate-y-0.5 cursor-pointer"
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
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
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
        enableColumnFilter: true,
      },
      {
        accessorKey: "subscribers",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title={t("sequences.subscribers")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">
            {row.original._count?.contactsOnSequences ?? 0}
          </div>
        ),
      },
      {
        accessorKey: "messages",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title={t("sequences.step")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">{row.original._count?.steps ?? 0}</div>
        ),
        size: 100,
        enableSorting: true,
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title={t("fields.status.label")}
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
        header: () => (
          <div className="w-full text-center">{t("actions.actions")}</div>
        ),
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
                  onSelect={() => setRowAction({ row, variant: "move" })}
                >
                  <FolderUpIcon className="mr-2" />
                  {t("actions.move")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="hover:bg-muted hover:text-destructive"
                  onClick={() => setRowAction({ row, variant: "delete" })}
                >
                  <Trash2Icon className="mr-2" />
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
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>

      <RenameSequenceDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "rename"}
        sequence={rowAction?.row.original || null}
      />

      <ChangeFolderDialog
        chatbotId={chatbotId}
        currentFolderId={rowAction?.row.original?.folderId || null}
        folderType={FolderType.sequence}
        modelId={rowAction?.row.original?.id || null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
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
        onOpenChange={(open) => {
          if (!open) {
            setBulkDeleteSequences([])
          }
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
