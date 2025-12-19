"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { createSequenceAction } from "@/features/sequences/actions/create-sequence.action"
import { createSequenceRequest } from "@/features/sequences/schemas/create-sequence-schema"

export function CreateSequenceForm({ chatbotId }: { chatbotId: string }) {
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createSequenceAction.bind(null, chatbotId),
    zodResolver(createSequenceRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.sequences.label"),
            }),
          )
          if (data?.sequenceId) {
            router.push(`/chatbots/${chatbotId}/sequences/${data.sequenceId}`)
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
        },
      },
      errorMapProps: {},
    },
  )

  const { formState } = form

  const handleCancel = () => {
    router.push(`/chatbots/${chatbotId}/sequences`)
  }

  return (
    <div className="flex h-svh flex-col items-center justify-center">
      <Form {...form}>
        <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
          <Card className="mt-10 w-xl">
            <CardHeader>
              <CardTitle className="text-xl">
                {t("actions.createFeature", {
                  feature: t("fields.sequences.label"),
                })}
              </CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
              <InputField
                label={t("fields.name.label")}
                name="name"
                placeholder={t("fields.name.placeholder")}
                required
              />

              <div className="flex justify-end gap-2">
                <Button onClick={handleCancel} type="button" variant="outline">
                  {t("actions.cancel")}
                </Button>

                <Button
                  disabled={!formState.isValid || formState.isSubmitting}
                  type="submit"
                >
                  {formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.confirm")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  )
}
