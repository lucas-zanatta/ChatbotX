"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import { Input } from "@aha.chat/ui/components/ui/input"
import { Label } from "@aha.chat/ui/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import { Separator } from "@aha.chat/ui/components/ui/separator"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { useFlowStore } from "@/features/flows/provider/flow-store-context"
import { deleteSequenceStepAction } from "../actions/delete-sequence-step.action"
import { upsertSequenceStepAction } from "../actions/upsert-sequence-step.action"
import { FlowSelectorSimple } from "./flow-selector-simple"

type DelayUnit = "immediate" | "minutes" | "hours" | "days" | "specificTime"

const WEEKDAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]

type SequenceStepCardProps = {
  step?: {
    id: string
    order: number
    delayDays: number
    delayHours: number
    flowId: string
    flow: { id: string; name: string }
    isActive?: boolean
    anytime?: boolean
    sendTimeStart?: string | null
    sendTimeEnd?: string | null
    sendDays?: string | null
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
    if (!step) {
      return "days"
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
      return 1
    }
    if (step.delayDays > 0) {
      return step.delayDays
    }
    if (step.delayHours > 0) {
      return step.delayHours
    }
    return 1
  }

  // Always in edit mode - removed isEditing state
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(getInitialDelayUnit())
  const [delayValue, setDelayValue] = useState<number>(getInitialDelayValue())
  const [specificDateTime, setSpecificDateTime] = useState<string>("")
  const [selectedFlowId, setSelectedFlowId] = useState<string>(
    step?.flowId || "",
  )
  const [isActive, setIsActive] = useState(step?.isActive ?? false)
  const [_isSaving, setIsSaving] = useState(false)
  const [isSchedulePopoverOpen, setIsSchedulePopoverOpen] = useState(false)
  const [timeOption, setTimeOption] = useState<"anytime" | "between">(
    step?.anytime === false ? "between" : "anytime",
  )
  const [startTime, setStartTime] = useState(step?.sendTimeStart || "09:00")
  const [endTime, setEndTime] = useState(step?.sendTimeEnd || "17:00")
  const [selectedDays, setSelectedDays] = useState<string[]>(
    step?.sendDays
      ? JSON.parse(step.sendDays)
      : [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
  )
  const [isDayPopoverOpen, setIsDayPopoverOpen] = useState(false)
  const isSavingRef = useRef(false)

  const handleSave = useCallback(
    async (flowIdOverride?: string) => {
      const effectiveFlowId = flowIdOverride ?? selectedFlowId

      // For new steps, require flow to be selected
      if (!(step?.id || effectiveFlowId)) {
        return // Don't save new step without flow
      }

      // For existing steps, use existing flowId if no new flow selected
      const finalFlowId = effectiveFlowId || step?.flowId
      if (!finalFlowId) {
        return // Still need a flowId to save
      }

      if (isSavingRef.current) {
        return // Prevent concurrent saves
      }

      isSavingRef.current = true

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
        // Convert delayValue to days or hours based on delayUnit
        let delayDays = 0
        let delayHours = 0

        if (delayUnit === "days") {
          delayDays = delayValue
        } else if (delayUnit === "hours") {
          delayHours = delayValue
        } else if (delayUnit === "minutes") {
          delayHours = delayValue / 60
        }

        const result = await upsertSequenceStepAction(chatbotId, {
          stepId: step?.id,
          sequenceId,
          order: stepNumber - 1,
          delayDays,
          delayHours,
          delayUnit,
          specificDateTime: specificDateTime || undefined,
          flowId: finalFlowId,
          isActive,
          anytime: timeOption === "anytime",
          sendTimeStart: timeOption === "between" ? startTime : undefined,
          sendTimeEnd: timeOption === "between" ? endTime : undefined,
          sendDays: selectedDays,
        })

        if (result?.data) {
          toast.success(t("messages.savedSuccessfully"))
          onSaved?.()
          router.refresh()
        } else {
          toast.error(t("messages.unknownError"))
        }
      } catch (error) {
        console.error("Error saving step:", error)
        toast.error(t("messages.unknownError"))
      } finally {
        setIsSaving(false)
        isSavingRef.current = false
      }
    },
    [
      chatbotId,
      delayUnit,
      delayValue,
      endTime,
      isActive,
      selectedDays,
      selectedFlowId,
      specificDateTime,
      startTime,
      step?.id,
      stepNumber,
      t,
      timeOption,
      sequenceId,
      onSaved,
      router,
      isFirst,
      previousStepTime,
      step?.flowId,
    ],
  )

  const handleDelete = async () => {
    if (!step?.id) {
      return
    }

    try {
      const result = await deleteSequenceStepAction(chatbotId, {
        stepId: step.id,
        sequenceId,
      })

      if (result?.data) {
        toast.success(
          t("messages.deletedSuccess", { feature: t("sequences.step") }),
        )
        router.refresh()
      } else {
        toast.error(t("messages.deleteFailed"))
      }
    } catch (error) {
      console.error("Error deleting step:", error)
      toast.error(t("messages.deleteFailed"))
    }
  }

  const _handleCancel = () => {
    if (isNew) {
      onCancel?.()
    }
    // No need to reset values since we're always in edit mode
  }

  const _selectedFlow = flows.find((f) => f.id === selectedFlowId)

  const handleSelectFlow = useCallback(
    (flowId: string) => {
      setSelectedFlowId(flowId)
      // Auto-save after selecting a flow so the step is saved without an explicit save button
      setTimeout(() => {
        void handleSave(flowId)
      }, 100)
    },
    [handleSave],
  )

  const handleActiveChange = useCallback(
    (checked: boolean) => {
      setIsActive(checked)
      // Auto-save when active toggle changes
      // Only save if step already exists (has ID)
      if (step?.id) {
        setTimeout(() => {
          void handleSave()
        }, 100)
      }
    },
    [handleSave, step?.id],
  )

  const handleScheduleSave = useCallback(() => {
    setIsSchedulePopoverOpen(false)
    // Save schedule changes to DB
    // Save if step exists (for existing steps) or if flow is selected (for new steps)
    if (step?.id || selectedFlowId) {
      void handleSave()
    }
  }, [handleSave, selectedFlowId, step?.id])

  const getDelayText = () => {
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
    return `${t("sequences.afterText")} ${delayValue} ${t(`sequences.delayUnits.${delayUnit}`)}`
  }

  return (
    <div className="grid grid-cols-[130px_1fr] gap-4">
      {/* Left side - Schedule */}
      <div className="relative flex items-center border-r-2 pr-4">
        {/* Timeline circle */}
        <div className="absolute -right-[7px] h-3 w-3 rounded-full border-2 border-background bg-muted" />
        <Popover
          onOpenChange={setIsSchedulePopoverOpen}
          open={isSchedulePopoverOpen}
        >
          <PopoverTrigger asChild>
            <Button
              className="h-auto justify-start p-0 font-medium text-muted-foreground hover:text-foreground"
              variant="ghost"
            >
              <span className="font-normal text-sm underline decoration-2 decoration-muted-foreground/40 underline-offset-6">
                {getDelayText()}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-6">
            <div className="space-y-5">
              <div>
                <Label className="mb-2 font-semibold text-base">
                  {t("sequences.schedule")}
                </Label>
                <p className="text-muted-foreground text-xs">
                  {t("sequences.messageSentAtLeast")}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  {delayUnit !== "immediate" &&
                    delayUnit !== "specificTime" && (
                      <Input
                        className="w-20"
                        max={99_999}
                        min={1}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          if (value >= 1) {
                            setDelayValue(value)
                          }
                        }}
                        type="number"
                        value={delayValue}
                      />
                    )}
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

                {delayUnit === "specificTime" && (
                  <div>
                    <Label className="mb-2 text-sm">
                      {t("sequences.specificDateTime")}
                    </Label>
                    <Input
                      onChange={(e) => setSpecificDateTime(e.target.value)}
                      type="datetime-local"
                      value={specificDateTime}
                    />
                  </div>
                )}

                <p className="text-muted-foreground text-xs">
                  {t("sequences.afterPreviousMessage")}
                </p>
              </div>

              <Separator />

              {/* Time selection */}
              <div className="space-y-2">
                <Select
                  onValueChange={(value) =>
                    setTimeOption(value as "anytime" | "between")
                  }
                  value={timeOption}
                >
                  <SelectTrigger className="bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anytime">
                      {t("sequences.anyTime")}
                    </SelectItem>
                    <SelectItem value="between">
                      {t("sequences.sendBetween")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {timeOption === "between" && (
                  <div className="flex gap-2">
                    <Input
                      onChange={(e) => setStartTime(e.target.value)}
                      type="time"
                      value={startTime}
                    />
                    <span className="flex items-center">-</span>
                    <Input
                      onChange={(e) => setEndTime(e.target.value)}
                      type="time"
                      value={endTime}
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Day selection */}
              <Popover
                onOpenChange={setIsDayPopoverOpen}
                open={isDayPopoverOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    className="w-full justify-start font-normal"
                    variant="outline"
                  >
                    {selectedDays.length === 7
                      ? t("sequences.anyDay")
                      : selectedDays.length === 0
                        ? t("sequences.selectDays")
                        : selectedDays
                            .map((d) => t(`sequences.${d.slice(0, 3)}`))
                            .join(", ")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {WEEKDAY_ORDER.map((day) => (
                        <div className="flex items-center space-x-2" key={day}>
                          <Checkbox
                            checked={selectedDays.includes(day)}
                            id={`day-${day}`}
                            onCheckedChange={(checked) => {
                              let newDays: string[]
                              if (checked) {
                                newDays = [...selectedDays, day]
                              } else {
                                newDays = selectedDays.filter((d) => d !== day)
                              }
                              // Sort by weekday order
                              newDays.sort(
                                (a, b) =>
                                  WEEKDAY_ORDER.indexOf(a as any) -
                                  WEEKDAY_ORDER.indexOf(b as any),
                              )
                              setSelectedDays(newDays)
                            }}
                          />
                          <label
                            className="cursor-pointer font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            htmlFor={`day-${day}`}
                          >
                            {t(`sequences.${day}`)}
                          </label>
                        </div>
                      ))}
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (selectedDays.length === 7) {
                          setSelectedDays([])
                        } else {
                          setSelectedDays([...WEEKDAY_ORDER])
                        }
                      }}
                      variant="outline"
                    >
                      {selectedDays.length === 7
                        ? t("sequences.deselectAll")
                        : t("sequences.anyDay")}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <Separator />

              <Button className="w-full" onClick={handleScheduleSave}>
                {t("sequences.saveUpdateSchedule")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Right side - Flow selection + Active toggle */}
      <div className="mt-2 mb-2 pl-4">
        <Card className="py-2">
          <CardContent>
            <FlowSelectorSimple
              chatbotId={chatbotId}
              flows={flows}
              isActive={isActive}
              isNew={isNew}
              onActiveChange={handleActiveChange}
              onDelete={handleDelete}
              onSelectFlow={handleSelectFlow}
              selectedFlowId={selectedFlowId}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
