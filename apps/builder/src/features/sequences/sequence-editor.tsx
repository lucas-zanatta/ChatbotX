"use client"

import type { SequenceModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { FlowStoreProvider } from "../flows/provider/flow-store-context"
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
  const [isAddingStep, setIsAddingStep] = useState(false)

  const handleAddStep = () => {
    setIsAddingStep(true)
  }

  return (
    <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <div className="container mx-auto max-w-4xl py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">{sequence.name}</CardTitle>
              {sequence.steps.length !== 0 && (
                <Button onClick={handleAddStep} size="sm">
                  <PlusIcon className="h-4 w-4" />
                  {t("sequences.addStep")}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
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
