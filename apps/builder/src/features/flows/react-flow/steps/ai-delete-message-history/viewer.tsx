"use client"

import type { AIDeleteMessageHistorySchema } from "@chatbotx.io/flow-config"
import { Handle, Position } from "@xyflow/react"
import { BotIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

type AIDeleteMessageHistoryViewerProps = {
  data: AIDeleteMessageHistorySchema
}

export const AIDeleteMessageHistoryViewer = (
  props: AIDeleteMessageHistoryViewerProps,
) => {
  const { data } = props
  const t = useTranslations()

  const successState = data.states?.find((s) => s.stateType === "success")

  return (
    <div className="flex flex-col gap-4">
      <BaseStepViewer
        icon={BotIcon}
        title={t("flows.actions.aiDeleteMessageHistory")}
      />

      {successState && (
        <div className="flex flex-col items-end gap-2 pr-4 pb-4">
          <div className="relative flex items-center gap-2 text-xs">
            {t("messages.success")}
            <div className="h-4 w-4 rounded-full border-2 border-green-500">
              <Handle
                className="right-[8px]! h-4! w-4! opacity-0!"
                id={successState.id}
                position={Position.Right}
                type="source"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
