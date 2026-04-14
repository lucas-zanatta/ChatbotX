"use client"

import type { FlowNode, NodeType } from "@chatbotx.io/flow-config"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Position } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { memo } from "react"
import { BaseHandle } from "@/components/base-handle"
import { AnalyticsModeProvider } from "../analytics-context"
import { DynamicStepViewer } from "../steps"
import { ButtonStepViewer } from "../steps/button/viewer"
import { allNodesConfig } from "./node-config"

type NodeAnalyticsViewerProps = {
  id: string
  type: NodeType
  data: FlowNode["data"] & {
    analytics?: {
      sent: number
      delivered: number
      seen: number
      clicked: number
    }
  }
}

function StatItem({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-semibold text-sm">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

export const NodeAnalyticsViewer = memo((props: NodeAnalyticsViewerProps) => {
  const { id, type, data } = props
  const t = useTranslations()

  const nodeConfig = allNodesConfig[type]?.(t)
  const analytics = data.analytics

  const deliveredPct =
    analytics && analytics.sent > 0
      ? Math.round((analytics.delivered / analytics.sent) * 100)
      : 0
  const seenPct =
    analytics && analytics.sent > 0
      ? Math.round((analytics.seen / analytics.sent) * 100)
      : 0
  const clickedPct =
    analytics && analytics.sent > 0
      ? Math.round((analytics.clicked / analytics.sent) * 100)
      : 0

  return data.details && nodeConfig ? (
    <>
      <div className="absolute min-h-6 w-full -translate-y-full transform">
        {data.isStartNode && (
          <div className="inline-flex items-center gap-1 rounded-xl border bg-destructive px-1.5 py-0.5 text-sm text-white">
            Start
          </div>
        )}
      </div>

      <Card className="w-72 gap-0 p-0">
        <CardHeader className="relative gap-2 p-4">
          <BaseHandle
            id={id}
            isConnectableStart={false}
            position={Position.Left}
            type="target"
          />
          <CardTitle className="flex items-center gap-1">
            {nodeConfig?.icon ? <nodeConfig.icon className="size-5" /> : " "}
            {data.name}
          </CardTitle>

          <div className="flex justify-between border-t pt-2">
            <StatItem label="Sent" value={analytics?.sent ?? 0} />
            <StatItem label="Delivered" value={`${deliveredPct}%`} />
            <StatItem label="Seen" value={`${seenPct}%`} />
            <StatItem label="Clicked" value={`${clickedPct}%`} />
          </div>
        </CardHeader>

        <AnalyticsModeProvider>
          <CardContent className="flex flex-col gap-4 p-4 pt-0">
            {"steps" in data.details &&
              data.details.steps &&
              data.details.steps.length > 0 &&
              data.details.steps.map((stepItem) => (
                <DynamicStepViewer
                  data={stepItem}
                  key={stepItem.id}
                  type={stepItem.stepType}
                />
              ))}

            {"quickReplies" in data.details &&
              data.details.quickReplies &&
              data.details.quickReplies.length > 0 &&
              data.details.quickReplies.map((quickReplyItem) => (
                <ButtonStepViewer
                  data={quickReplyItem}
                  key={quickReplyItem.id}
                />
              ))}

            <div className="relative w-full text-right">
              <span className="mr-4">{t("actions.continue")}</span>
              <BaseHandle id={id} position={Position.Right} type="source" />
            </div>
          </CardContent>
        </AnalyticsModeProvider>
      </Card>
    </>
  ) : (
    <div>Node not found</div>
  )
})

NodeAnalyticsViewer.displayName = "NodeAnalyticsViewer"
