"use client"

import {
  filterContactFields,
  filterContactOperators,
} from "@chatbotx.io/flow-config"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { GitBranchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const FilterContactStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()

  const fieldOptions = [
    {
      label: t("flows.filterContact.fields.igFollowBusiness"),
      value: filterContactFields.enum.ig_follow_business,
    },
  ]

  const operatorOptions = [
    {
      label: t("flows.filterContact.operators.is"),
      value: filterContactOperators.enum.is,
    },
    {
      label: t("flows.filterContact.operators.isNot"),
      value: filterContactOperators.enum.isNot,
    },
  ]

  const valueOptions = [
    { label: t("flows.filterContact.values.true"), value: "true" },
    { label: t("flows.filterContact.values.false"), value: "false" },
  ]

  return (
    <BaseStepEditor
      icon={GitBranchIcon}
      title={t("flows.actions.filterContact")}
    >
      <div className="flex flex-col gap-3">
        <SelectField
          label={t("flows.filterContact.field")}
          name={`${parentName}.field`}
          options={fieldOptions}
          required
        />
        <SelectField
          label={t("flows.filterContact.operator")}
          name={`${parentName}.operator`}
          options={operatorOptions}
          required
        />
        <SelectField
          label={t("flows.filterContact.value")}
          name={`${parentName}.value`}
          options={valueOptions}
          required
        />
      </div>
    </BaseStepEditor>
  )
}

export default FilterContactStepEditor
