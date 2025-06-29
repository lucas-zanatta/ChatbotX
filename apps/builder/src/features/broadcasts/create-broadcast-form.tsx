"use client"

import { SelectField } from "@/components/form/select-field"
import WhatsappIcon from "@/components/icons/whatsapp"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DateTimePicker } from "@/components/ui/date-picker"
import { Form } from "@/components/ui/form"
import { Label } from "@/components/ui/label"
import { createBroadcastAction } from "@/features/broadcasts/actions/create-broadcast.action"
import { createBroadcastRequest } from "@/features/broadcasts/schemas/create-broadcast-schema"
import { BroadcastSchedulesType, InboxType } from "@ahachat.ai/database/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { add } from "date-fns"
import { AtomIcon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import { toast } from "sonner"
import { ContactFilterManage } from "../contacts/components/contact-filter"
import { FlowSelect } from "../flows/flow-select"
// import type { listInboxes } from "../inboxes/queries"

export const CreateBroadcastForm = ({
  chatbotId,
  // promises,
}: {
  chatbotId: string
  // promises: Promise<Awaited<ReturnType<typeof listInboxes>>>
}) => {
  const { t } = useTranslate()

  const [contactCount, setContactCount] = useState(0)
  const [isLoadingContactCount, setIsLoadingContactCount] = useState(false)

  const schedulesOptions = [
    {
      value: BroadcastSchedulesType.NOW,
      label: "Now",
    },
    {
      value: BroadcastSchedulesType.FUTURE,
      label: "Schedule for later (All simultaneously)",
    },
  ]
  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue },
  } = useHookFormAction(
    createBroadcastAction.bind(null, chatbotId),
    zodResolver(createBroadcastRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Broadcast created successfully")
          resetFormAndAction()
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          inboxType: null,
          // subaction: null,
          schedulesType: BroadcastSchedulesType.NOW,
          schedulesAt: null,
          contactFilter: {
            joinOperator: "AND",
            conditions: [],
          },
        },
      },
      errorMapProps: {},
    },
  )

  const inboxType = form.watch("inboxType")
  const schedulesType = form.watch("schedulesType")

  useEffect(() => {
    if (inboxType) {
      setIsLoadingContactCount(true)
      fetch(`/api/chatbots/${chatbotId}/contacts/count`)
        .then(async (results) => {
          const json: { total: number } = await results.json()
          setContactCount(json.total)
          setIsLoadingContactCount(false)
        })
        .catch(() => {
          setContactCount(0)
          setIsLoadingContactCount(false)
        })
    } else {
      setContactCount(0)
    }
  }, [inboxType, chatbotId])

  return (
    <div className="flex justify-center">
      <Card key={t.name} className="w-5/6">
        <CardContent className="py-4">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              {!inboxType && <InboxTypeSelect />}

              {inboxType && (
                <>
                  <div>{inboxType}</div>

                  <FlowSelect
                    label="Flow to send"
                    name="flowId"
                    isRequired={true}
                  />

                  <SelectField
                    name="schedulesType"
                    label={t("broadcasts.scheduleSendMessage")}
                    isRequired={true}
                    options={schedulesOptions}
                  />

                  {schedulesType === BroadcastSchedulesType.FUTURE && (
                    <DateTimePicker
                      granularity="minute"
                      displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
                      value={add(new Date(), { minutes: 1 })}
                      onChange={(value) => {
                        setValue(
                          "schedulesAt",
                          (value ?? new Date()).toISOString(),
                        )
                      }}
                    />
                  )}

                  <div>
                    <Label>
                      Targeting:{" "}
                      {isLoadingContactCount ? <Loader2Icon /> : contactCount}
                    </Label>

                    <ContactFilterManage parentName="contactFilter" />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="link" asChild>
                      <Link href={`/chatbots/${chatbotId}/broadcasts`}>
                        Cancel
                      </Link>
                    </Button>

                    <Button
                      type="submit"
                      disabled={
                        !form.formState.isValid || form.formState.isSubmitting
                      }
                    >
                      {form.formState.isSubmitting && (
                        <Loader2Icon className="animate-spin" />
                      )}
                      {t("common.confirm-btn")}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

function InboxTypeSelect() {
  const { setValue } = useFormContext()

  const inboxTypes = [
    {
      icon: WhatsappIcon,
      name: "Whatsapp",
      value: InboxType.WHATSAPP,
      description: "",
    },
    {
      icon: AtomIcon,
      name: "Omnichannel",
      value: null,
      description:
        "Send a flow to all contacts. You can send messages or executes actions.",
    },
  ]

  return (
    <>
      {inboxTypes.map((t) => (
        <div className="flex items-center w-full gap-2" key={t.value}>
          <span className="flex-1 flex gap-2">
            <t.icon />
            {t.name}
          </span>
          <Button
            variant="secondary"
            onClick={() => setValue("inboxType", t.value)}
          >
            Continue
          </Button>
        </div>
      ))}
    </>
  )
}
