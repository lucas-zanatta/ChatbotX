"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { Badge } from "@aha.chat/ui/components/ui/badge"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  CheckCircleIcon,
  MoreHorizontalIcon,
  PauseCircleIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { useMemo, useState } from "react"
import { toast } from "sonner"
import type { listSequences } from "@/features/sequences/queries"
import { toggleSequenceStatusAction } from "./actions/toggle-sequence-status.action"
import { DeleteSequenceDialog } from "./delete-sequence-dialog"
import { RenameSequenceDialog } from "./rename-sequence-dialog"
import type { SequenceResource } from "./schemas/get-sequences-schema"

type SequencesTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listSequences>>]>
}

export function SequencesTable({ promises }: SequencesTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const t = useTranslations()
  const router = useRouter()

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<SequenceResource> | null>(null)

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
        id: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <Link
            className="font-medium text-primary hover:underline"
            href={`/chatbots/${chatbotId}/sequences/${row.original.id}`}
          >
            {row.original.name ?? ""}
          </Link>
        ),
      },
      {
        id: "subscribers",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Subscribers" />
        ),
        cell: ({ row }) => (
          <div>{row.original._count?.contactsOnSequences ?? 0}</div>
        ),
      },
      {
        id: "messages",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Messages" />
        ),
        cell: ({ row }) => <div>{row.original.messages ?? 0}</div>,
      },
      {
        accessorKey: "openRate",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Open Rate" />
        ),
        cell: ({ row }) => (
          <div>{Math.round(row.original.openRate * 100)}%</div>
        ),
      },
      {
        accessorKey: "ctr",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="CTR" />
        ),
        cell: ({ row }) => <div>{Math.round(row.original.ctr * 100)}%</div>,
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) =>
          row.original.active ? (
            <Badge variant="default">Active</Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
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
                onClick={() => setRowAction({ row, variant: "delete" })}
              >
                <TrashIcon className="mr-2" />
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t, chatbotId, handleToggleStatus],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: false }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <div className="flex justify-end">
            <Button asChild size="sm">
              <Link href={`/chatbots/${chatbotId}/sequences/create`}>
                <PlusIcon />
                {t("actions.createFeature", {
                  feature: t("fields.sequences.label"),
                })}
              </Link>
            </Button>
          </div>
        </DataTableToolbar>
      </DataTable>

      <RenameSequenceDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "rename"}
        sequence={rowAction?.row.original || null}
      />

      <DeleteSequenceDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "delete"}
        sequence={rowAction?.row.original || null}
      />
    </>
  )
}
