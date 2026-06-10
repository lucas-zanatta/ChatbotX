"use client"

import {
  type SendFoxCreateContactSchema,
  sendFoxCreateContactSchema,
} from "@chatbotx.io/flow-config"
import type { SendFoxList } from "@chatbotx.io/integration-send-fox"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { callAPI } from "@/lib/swr"
import { BaseStepEditor } from "../base/editor"

const SendFoxDialog = ({ parentName }: { parentName: string }) => {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue } = useFormContext()
  const form = useForm<SendFoxCreateContactSchema>({
    resolver: zodResolver(sendFoxCreateContactSchema),
    defaultValues: { ...getValues(parentName) },
    mode: "onChange",
  })
  const { data, error, isLoading } = callAPI<{ data: SendFoxList[] }>(
    `/api/workspaces/${workspaceId}/send-fox/lists`,
  )
  const listOptions = useMemo(
    () =>
      (data?.data ?? []).map((list) => ({
        label: list.name,
        value: String(list.id),
      })),
    [data],
  )
  const submit = (value: SendFoxCreateContactSchema) => {
    setValue(parentName, value)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          {t("actions.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("flows.actions.sendFoxCreateContact")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(submit)}
          >
            <ComboboxField
              label={t("sendFox.fields.list")}
              name="listId"
              options={listOptions}
            />
            {isLoading && (
              <p className="text-muted-foreground text-sm">
                {t("sendFox.lists.loading")}
              </p>
            )}
            {error && (
              <p className="text-destructive text-sm">
                {t("sendFox.lists.error")}
              </p>
            )}
            {!(isLoading || error) && listOptions.length === 0 && (
              <p className="text-muted-foreground text-sm">
                {t("sendFox.lists.empty")}
              </p>
            )}
            <CustomFieldSelect
              includeReserved
              label={t("sendFox.fields.emailField")}
              name="emailField"
              required
            />
            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="secondary"
              >
                {t("actions.cancel")}
              </Button>
              <Button disabled={!form.formState.isValid} type="submit">
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default function SendFoxCreateContactEditor(props: {
  parentName: string
}) {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.sendFoxCreateContact")}
    >
      <SendFoxDialog parentName={props.parentName} />
    </BaseStepEditor>
  )
}
