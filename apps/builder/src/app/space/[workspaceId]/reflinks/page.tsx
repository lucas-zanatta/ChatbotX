import { organizationService, resolvePlatformUrls } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { PlatformUrlsProvider } from "@/features/platform"
import { listReflinks } from "@/features/reflinks/queries"
import { ReflinksTable } from "@/features/reflinks/reflinks-table"
import { listReflinksSearchParamsCache } from "@/features/reflinks/schemas/query"
import { getDomainFromHeader } from "@/lib/domain"

export default async function ReflinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const domain = await getDomainFromHeader()
  const organization = await organizationService.findByDomain(domain)
  const platformUrls = await resolvePlatformUrls({
    organizationId: organization.id,
  })

  const t = await getTranslations()

  const search = listReflinksSearchParamsCache.parse(await searchParams)

  const promises = Promise.all([
    listReflinks({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          {
            label: t("tools.title"),
            href: `/space/${workspaceId}/tools`,
          },
          { label: t("reflinks.title"), href: "" },
        ]}
      />
      <InboxStoreProvider workspaceId={workspaceId}>
        <FlowStoreProvider workspaceId={workspaceId}>
          <CustomFieldStoreProvider workspaceId={workspaceId}>
            <PlatformUrlsProvider urls={platformUrls}>
              <Suspense>
                <ReflinksTable promises={promises} workspaceId={workspaceId} />
              </Suspense>
            </PlatformUrlsProvider>
          </CustomFieldStoreProvider>
        </FlowStoreProvider>
      </InboxStoreProvider>
    </div>
  )
}
