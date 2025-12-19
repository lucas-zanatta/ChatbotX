"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { Input } from "@aha.chat/ui/components/ui/input"
import { Label } from "@aha.chat/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import { CheckIcon, PencilIcon, TrashIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { useFlowStore } from "@/features/flows/provider/flow-store-context"
import { FlowSelectorSimple } from "./flow-selector-simple"

type DelayUnit = "immediate" | "minutes" | "hours" | "days" | "specificTime"

type SequenceStepCardProps = {
  step?: {
    id: string
    order: number
    delayDays: number
    delayHours: number
    flowId: string
    flow: { id: string; name: string }
  }
  stepNumber: number
  sequenceId: string
  chatbotId: string
  isFirst?: boolean
  isNew?: boolean
  onCancel?: () => void
  onSaved?: () => void
  previousStepTime?: Date
}

export function SequenceStepCard({
  step,
  stepNumber,
  sequenceId,
  chatbotId,
  isFirst = false,
  isNew = false,
  onCancel,
  onSaved,
  previousStepTime,
}: SequenceStepCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const { flows } = useFlowStore((state) => state)

  // Convert existing delay to unit + value
  const getInitialDelayUnit = (): DelayUnit => {
    if (isFirst || !step) {
      return "immediate"
    }
    if (step.delayDays > 0) {
      return "days"
    }
    if (step.delayHours > 0) {
      return "hours"
    }
    return "immediate"
  }

  const getInitialDelayValue = (): number => {
    if (!step) {
      return 0
    }
    if (step.delayDays > 0) {
      return step.delayDays
    }
    if (step.delayHours > 0) {
      return step.delayHours
    }
    return 0
  }

  const [isEditing, setIsEditing] = useState(isNew)
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(getInitialDelayUnit())
  const [delayValue, setDelayValue] = useState<number>(getInitialDelayValue())
  const [specificDateTime, setSpecificDateTime] = useState<string>("")
  const [selectedFlowId, setSelectedFlowId] = useState<string>(
    step?.flowId || "",
  )
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!selectedFlowId) {
      toast.error(t("sequences.pleaseSelectFlow"))
      return
    }

    // Validation: thời gian step sau phải lớn hơn step trước
    if (
      !isFirst &&
      previousStepTime &&
      delayUnit === "specificTime" &&
      specificDateTime
    ) {
      const currentStepTime = new Date(specificDateTime)
      if (currentStepTime <= previousStepTime) {
        toast.error(t("sequences.timeValidation"))
        return
      }
    }

    setIsSaving(true)
    try {
      // TODO: Call API to create/update step
      // const response = await createOrUpdateStep({
      //   sequenceId,
      //   stepId: step?.id,
      //   order: stepNumber - 1,
      //   delayUnit,
      //   delayValue,
      //   specificDateTime,
      //   flowId: selectedFlowId,
      // })

      toast.success(t("messages.savedSuccessfully"))
      setIsEditing(false)
      onSaved?.()
      router.refresh()
    } catch (_error) {
      toast.error(t("messages.unknownError"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!step?.id) {
      return
    }

    if (!confirm(t("sequences.confirmDeleteStep"))) {
      return
    }

    try {
      // TODO: Call API to delete step
      // await deleteStep(step.id)
      toast.success(
        t("messages.deletedSuccess", { feature: t("sequences.step") }),
      )
      router.refresh()
    } catch (_error) {
      toast.error(t("messages.deleteFailed"))
    }
  }

  const handleCancel = () => {
    if (isNew) {
      onCancel?.()
    } else {
      setIsEditing(false)
      // Reset to original values
      setDelayUnit(getInitialDelayUnit())
      setDelayValue(getInitialDelayValue())
      setSelectedFlowId(step?.flowId || "")
    }
  }

  const selectedFlow = flows.find((f) => f.id === selectedFlowId)

  const getDelayText = () => {
    if (isFirst) {
      return t("sequences.afterEnrollment")
    }
    if (delayUnit === "immediate") {
      return t("sequences.delayUnits.immediate")
    }
    if (delayUnit === "specificTime" && specificDateTime) {
      const date = new Date(specificDateTime)
      return date.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    }
    return `After ${delayValue} ${t(`sequences.delayUnits.${delayUnit}`)}`
  }

  return (
    <div className="mb-4">
      {isEditing ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {!isFirst && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="mb-2">{t("sequences.delay")}</Label>
                  <Select
                    onValueChange={(value) => setDelayUnit(value as DelayUnit)}
                    value={delayUnit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">
                        {t("sequences.delayUnits.immediate")}
                      </SelectItem>
                      <SelectItem value="minutes">
                        {t("sequences.delayUnits.minutes")}
                      </SelectItem>
                      <SelectItem value="hours">
                        {t("sequences.delayUnits.hours")}
                      </SelectItem>
                      <SelectItem value="days">
                        {t("sequences.delayUnits.days")}
                      </SelectItem>
                      <SelectItem value="specificTime">
                        {t("sequences.delayUnits.specificTime")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {delayUnit === "specificTime" ? (
                  <div className="flex-1">
                    <Label className="mb-2">
                      {t("sequences.specificDateTime")}
                    </Label>
                    <Input
                      onChange={(e) => setSpecificDateTime(e.target.value)}
                      type="datetime-local"
                      value={specificDateTime}
                    />
                  </div>
                ) : (
                  delayUnit !== "immediate" && (
                    <div className="flex-1">
                      <Label className="mb-2">
                        {t("sequences.delayValue")}
                      </Label>
                      <Input
                        min={1}
                        onChange={(e) => setDelayValue(Number(e.target.value))}
                        type="number"
                        value={delayValue}
                      />
                    </div>
                  )
                )}
              </div>
            )}

            <div>
              <FlowSelectorSimple
                chatbotId={chatbotId}
                flows={flows}
                onSelectFlow={setSelectedFlowId}
                selectedFlowId={selectedFlowId}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={handleCancel} size="sm" variant="outline">
                <XIcon className="h-4 w-4" />
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={isSaving || !selectedFlowId}
                onClick={handleSave}
                size="sm"
              >
                <CheckIcon className="h-4 w-4" />
                {t("actions.save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-start gap-4">
          {/* Delay text - cột trái, ngoài card */}
          <div className="w-24 shrink-0 pt-3 text-muted-foreground text-sm">
            {getDelayText()}
          </div>

          {/* Card chứa toggle + flow - cột phải */}
          <Card className="flex-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                {/* Toggle switch */}
                <Switch checked={true} disabled />

                {/* Flow name */}
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-sm">
                    {selectedFlow
                      ? `Send ${selectedFlow.name}`
                      : t("sequences.noFlowSelected")}
                  </span>
                </div>

                {/* Edit + Delete buttons */}
                {!isNew && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      onClick={() => setIsEditing(true)}
                      size="icon"
                      variant="ghost"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      className="text-destructive"
                      onClick={handleDelete}
                      size="icon"
                      variant="ghost"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
