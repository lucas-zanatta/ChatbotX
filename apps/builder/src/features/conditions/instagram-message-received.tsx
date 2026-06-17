"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { useTranslations } from "next-intl"

export const InstagramMessageReceived = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-4">
      <InputField name={`${parentName}.id`} type="hidden" />
      <InputField name={`${parentName}.type`} type="hidden" />
      <InputField
        label={t("trigger.fields.messageContains")}
        name={`${parentName}.value.text`}
        placeholder={t("trigger.placeholders.anyMessageText")}
      />
      <InputField name={`${parentName}.operator`} type="hidden" />
    </div>
  )
}
