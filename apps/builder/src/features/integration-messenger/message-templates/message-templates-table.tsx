"use client"

import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useTranslations } from "next-intl"
import React from "react"
import { MessengerUtilityMessagesTableToolbarActions } from "./message-templates-table-toolbar-actions"
import type { ListMessengerMessageTemplatesResponse } from "./schema/query"

type MessengerUtilityMessagesTableProps = {
  integrationMessenger: IntegrationMessengerModel
  promises: Promise<ListMessengerMessageTemplatesResponse>
}

export function MessengerUtilityMessagesTable({
  integrationMessenger,
  promises,
}: MessengerUtilityMessagesTableProps) {
  const t = useTranslations()
  const data = React.use(promises)

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-bold text-lg sm:text-xl">
        {t("fields.templateMessages.label")}
      </h3>
      <div className="rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead>{t("fields.language.label")}</TableHead>
              <TableHead>{t("fields.category.label")}</TableHead>
              <TableHead>{t("fields.status.label")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((um) => (
              <TableRow key={um.id}>
                <TableCell>{um.name}</TableCell>
                <TableCell>{um.language}</TableCell>
                <TableCell>{um.category}</TableCell>
                <TableCell>{um.status}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell className="text-center" colSpan={4}>
                  {t("messages.noData")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col items-center justify-center p-4">
        <MessengerUtilityMessagesTableToolbarActions
          integrationMessengerId={integrationMessenger.id}
          workspaceId={integrationMessenger.workspaceId}
        />
      </div>
    </div>
  )
}
