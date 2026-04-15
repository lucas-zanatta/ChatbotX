"use client"

import AreaChart from "@chatbotx.io/ui/components/charts/area-chart"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function ReflinkStatsChart() {
  const t = useTranslations()

  const { refLink, refLinkStats } = useAnalysisStore((state) => state)

  return (
    <AreaChart
      data={refLinkStats.map((row) => ({
        label: format(new Date(row.dateReport), "MMM d"),
        value: row.clicks,
      }))}
      title={t("analytics.sessionsThroughTheRef", { ref: refLink?.name ?? "" })}
      valueLabel={t("analytics.total")}
    />
  )
}
