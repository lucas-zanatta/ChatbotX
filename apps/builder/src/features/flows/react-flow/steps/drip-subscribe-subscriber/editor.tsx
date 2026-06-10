"use client"

import {
  type DripSubscribeSubscriberSchema,
  dripSubscribeSubscriberSchema,
} from "@chatbotx.io/flow-config"
import type { DripCustomField } from "@chatbotx.io/integration-drip"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
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
import { ArrowRightIcon, MailIcon, PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { callAPI } from "@/lib/swr"
import { BaseStepEditor } from "../base/editor"

const DripDialog = ({ parentName }: { parentName: string }) => {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue } = useFormContext()

  const form = useForm<DripSubscribeSubscriberSchema>({
    resolver: zodResolver(dripSubscribeSubscriberSchema),
    defaultValues: { ...getValues(parentName) },
    mode: "onChange",
  })

  const {
    fields: mergeFields,
    append,
    remove,
  } = useFieldArray({
    control: form.control,
    name: "mergeFields",
  })

  const {
    data: tagsResponse,
    error: tagsError,
    isLoading: tagsLoading,
  } = callAPI<{ data: string[] }>(`/api/workspaces/${workspaceId}/drip/tags`)

  const {
    data: customFieldsResponse,
    error: customFieldsError,
    isLoading: customFieldsLoading,
  } = callAPI<{ data: DripCustomField[] }>(
    `/api/workspaces/${workspaceId}/drip/custom-fields`,
  )

  const tagOptions = useMemo(
    () => (tagsResponse?.data ?? []).map((tag) => ({ label: tag, value: tag })),
    [tagsResponse],
  )

  const customFieldOptions = useMemo(
    () =>
      (customFieldsResponse?.data ?? []).map((f) => ({
        label: f.label,
        value: f.identifier,
      })),
    [customFieldsResponse],
  )

  const submit = (data: DripSubscribeSubscriberSchema) => {
    setValue(parentName, data)
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
          <DialogTitle>
            {t("flows.actions.dripSubscribeSubscriber")}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(submit)}
          >
            <CustomFieldSelect
              includeReserved
              label={t("drip.fields.emailField")}
              name="emailField"
              required
            />
            <CustomFieldSelect
              includeReserved
              label={t("drip.fields.phoneField")}
              name="phoneField"
            />
            {tagsLoading && (
              <p className="text-muted-foreground text-sm">
                {t("drip.tags.loading")}
              </p>
            )}
            {tagsError && (
              <p className="text-destructive text-sm">{t("drip.tags.error")}</p>
            )}
            {!(tagsLoading || tagsError) && tagOptions.length === 0 && (
              <p className="text-muted-foreground text-sm">
                {t("drip.tags.empty")}
              </p>
            )}
            {tagOptions.length > 0 && (
              <MultiSelectField
                label={t("drip.fields.tags")}
                name="tags"
                options={tagOptions}
              />
            )}
            <div className="space-y-2">
              <p className="font-medium text-sm">
                {t("drip.fields.customFields")}
              </p>
              {customFieldsLoading && (
                <p className="text-muted-foreground text-sm">
                  {t("drip.customFields.loading")}
                </p>
              )}
              {customFieldsError && (
                <p className="text-destructive text-sm">
                  {t("drip.customFields.error")}
                </p>
              )}
              {mergeFields.map((field, index) => (
                <div
                  className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3"
                  key={field.id}
                >
                  <CustomFieldSelect
                    includeReserved
                    label=""
                    name={`mergeFields.${index}.contactFieldId`}
                  />
                  <ArrowRightIcon className="size-4 text-muted-foreground" />
                  <ComboboxField
                    label=""
                    name={`mergeFields.${index}.dripField`}
                    options={customFieldOptions}
                  />
                  <Button
                    aria-label={t("actions.remove")}
                    onClick={() => remove(index)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                onClick={() => append({ contactFieldId: "", dripField: "" })}
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon className="size-4" />
                {t("actions.add")}
              </Button>
            </div>
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

export default function DripSubscribeSubscriberEditor(props: {
  parentName: string
}) {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.dripSubscribeSubscriber")}
    >
      <DripDialog parentName={props.parentName} />
    </BaseStepEditor>
  )
}
