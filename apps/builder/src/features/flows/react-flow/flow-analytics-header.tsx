"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import type { FlowResource } from "../schemas/resource"

export function FlowAnalyticsHeader({ flow }: { flow: FlowResource }) {
  const t = useTranslations()
  const router = useRouter()

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <div className="flex-1">
        <AppBreadcrumb
          items={[
            {
              label: t("fields.flows.label"),
              href: `/space/${flow.workspaceId}/flows`,
            },
            {
              label: flow.name,
              href: `/space/${flow.workspaceId}/flows/${flow.id}`,
            },
            { label: t("actions.analytics"), href: "" },
          ]}
        />
      </div>

      <Button
        onClick={() =>
          router.push(`/space/${flow.workspaceId}/flows/${flow.id}`)
        }
        size="sm"
        variant="destructive"
      >
        {t("actions.deleteAnalytics")}
      </Button>
    </header>
  )
}
