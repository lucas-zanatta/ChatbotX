import { integrationSendFoxService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ManageSendFox } from "@/features/integration-send-fox/components/manage-send-fox"

export default async function SettingIntegrationSendFoxPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const integration =
    await integrationSendFoxService.findByWorkspaceId(workspaceId)
  return (
    <ManageSendFox
      isConnected={Boolean(integration)}
      workspaceId={workspaceId}
    />
  )
}
