import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { MessengerUtilityMessagesTable } from "@/features/integration-messenger/message-templates/message-templates-table"
import { messengerMessageTemplateService } from "@/features/integration-messenger/message-templates/queries"
import { findIntegrationMessenger } from "@/features/integration-messenger/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function MessengerUtilityMessagesPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = await withWorkspaceIdAndIdSchema.safeParse(
    await props.params,
  )
  if (!data) {
    return notFound()
  }

  const t = await getTranslations()
  const { workspaceId, id } = data
  const integrationMessenger = await findIntegrationMessenger({
    workspaceId,
    id,
  })

  const promises = messengerMessageTemplateService.list({
    where: {
      workspaceId,
      integrationMessengerId: id,
    },
  })

  return (
    <Suspense>
      <AppBreadcrumb
        items={[
          {
            label: t("channels.title"),
            href: `/space/${workspaceId}/settings/channels`,
          },
          { label: t("fields.messenger.label"), href: "" },
        ]}
      />
      <MessengerUtilityMessagesTable
        integrationMessenger={integrationMessenger}
        promises={promises}
      />
    </Suspense>
  )
}
