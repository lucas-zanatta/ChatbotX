"use client"

import type { FilterContactStepSchema } from "@chatbotx.io/flow-config"
import { GitBranchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"

const FilterContactStepViewer = ({
  data,
}: {
  data: FilterContactStepSchema
}) => {
  const t = useTranslations()

  const stateLabels = {
    success: t("flows.filterContact.states.true"),
    skip: t("flows.filterContact.states.false"),
    error: t("flows.filterContact.states.error"),
  }

  return (
    <BaseStepViewer
      icon={GitBranchIcon}
      title={t("flows.actions.filterContact")}
    >
      <div className="flex flex-col gap-2">
        <div className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
          {t("flows.filterContact.summary.igFollowBusiness")}
        </div>
        <div className="mr-3 flex flex-col gap-1">
          {data.states.map((state) => (
            <BaseStateViewer
              data={state}
              key={state.id}
              label={stateLabels[state.stateType]}
            />
          ))}
        </div>
      </div>
    </BaseStepViewer>
  )
}

export default FilterContactStepViewer
