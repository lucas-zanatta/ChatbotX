"use client"

import type { SequenceModel } from "@aha.chat/database/types"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@aha.chat/ui/components/ui/breadcrumb"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent, CardHeader } from "@aha.chat/ui/components/ui/card"
import { Label } from "@aha.chat/ui/components/ui/label"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { FlowStoreProvider } from "../flows/provider/flow-store-context"
import { upsertSequenceStepAction } from "./actions/upsert-sequence-step.action"
import { SequenceStepCard } from "./components/sequence-step-card"

type SequenceEditorProps = {
  sequence: SequenceModel & {
    steps: Array<{
      id: string
      order: number
      delayDays: number
      delayHours: number
      flowId: string
      flow: { id: string; name: string }
    }>
  }
  chatbotId: string
}

export function SequenceEditor({ sequence, chatbotId }: SequenceEditorProps) {
  const t = useTranslations()
  const router = useRouter()
  const [isAddingStep, setIsAddingStep] = useState(false)

  const handleAddStep = async () => {
    try {
      // Create a new step with default values: 1 day delay, inactive
      const result = await upsertSequenceStepAction(chatbotId, {
        sequenceId: sequence.id,
        order: sequence.steps.length,
        delayDays: 1,
        delayHours: 0,
        delayUnit: "days",
        isActive: false,
        anytime: true,
        sendDays: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
      })

      if (result?.data) {
        toast.success(t("messages.savedSuccessfully"))
        router.refresh()
      } else {
        toast.error(t("messages.unknownError"))
      }
    } catch (error) {
      console.error("Error creating step:", error)
      toast.error(t("messages.unknownError"))
    }
  }

  return (
    <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <div className="container mx-1 py-1">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/chatbots/${chatbotId}/sequences`}>
                {t("fields.sequences.label")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                <Label className="font-semibold text-sm">{sequence.name}</Label>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="border-none shadow-none">
          <CardHeader>
            <div className="flex items-center justify-end gap-2">
              {sequence.steps.length > 0 && (
                <Button className="w-30" onClick={handleAddStep} size="sm">
                  <PlusIcon className="h-4 w-4" />
                  {t("sequences.addStep")}
                </Button>
              )}
              {/* <Button asChild className="w-20" size="sm" variant="outline">
                  <a href={`/chatbots/${chatbotId}/sequences`}>
                    {t("actions.back")}
                  </a>
                </Button> */}
            </div>
          </CardHeader>

          <CardContent>
            {sequence.steps.length === 0 && !isAddingStep && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">
                  {t("sequences.noSteps")}
                </p>
                <Button className="mt-4" onClick={handleAddStep}>
                  <PlusIcon className="h-4 w-4" />
                  {t("sequences.addFirstStep")}
                </Button>
              </div>
            )}

            {sequence.steps
              .sort((a, b) => a.order - b.order)
              .map((step, index) => (
                <SequenceStepCard
                  chatbotId={chatbotId}
                  isFirst={index === 0}
                  key={step.id}
                  sequenceId={sequence.id}
                  step={step}
                  stepNumber={index + 1}
                />
              ))}

            {isAddingStep && (
              <SequenceStepCard
                chatbotId={chatbotId}
                isNew
                onCancel={() => setIsAddingStep(false)}
                onSaved={() => setIsAddingStep(false)}
                sequenceId={sequence.id}
                stepNumber={sequence.steps.length + 1}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </FlowStoreProvider>
  )
}
