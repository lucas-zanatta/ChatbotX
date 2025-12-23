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
import { ChevronDownIcon, RotateCcwIcon, XIcon } from "lucide-react"
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
    delayMinutes: number
    delayUnit?: string | null
    specificDateTime?: Date | null
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

  const getOneHourFromNowLocal = () => {
    const now = new Date()
    now.setHours(now.getHours() + 1)
    const year = now.getFullYear()
    const month = `${now.getMonth() + 1}`.padStart(2, "0")
    const day = `${now.getDate()}`.padStart(2, "0")
    const hour = `${now.getHours()}`.padStart(2, "0")
    const minute = `${now.getMinutes()}`.padStart(2, "0")
    return `${year}-${month}-${day}T${hour}:${minute}`
  }

  // Convert existing delay to unit + value
  const getInitialDelayUnit = (): DelayUnit => {
    if (!step) {
      return "days"
    }
    // Check delayUnit from DB first
    if (step.delayUnit === "specificTime") {
      return "specificTime"
    }
    if (step.delayUnit === "immediate") {
      return "immediate"
    }
    // Fallback to calculating from delayDays/delayMinutes
    if (step.delayDays > 0) {
      return "days"
    }
    if (step.delayMinutes >= 60) {
      return "hours"
    }
    if (step.delayMinutes > 0) {
      return "minutes"
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
    if (step.delayMinutes >= 60) {
      return Math.floor(step.delayMinutes / 60)
    }
    if (step.delayMinutes > 0) {
      return step.delayMinutes
    }
    return 1
  }

  // Always in edit mode - removed isEditing state
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(getInitialDelayUnit())
  const [delayValue, setDelayValue] = useState<number>(getInitialDelayValue())
  const [specificDateTime, setSpecificDateTime] = useState<string>(() => {
    if (step?.specificDateTime) {
      // Convert UTC from DB to local datetime-local format
      const date = new Date(step.specificDateTime)
      const year = date.getFullYear()
      const month = `${date.getMonth() + 1}`.padStart(2, "0")
      const day = `${date.getDate()}`.padStart(2, "0")
      const hour = `${date.getHours()}`.padStart(2, "0")
      const minute = `${date.getMinutes()}`.padStart(2, "0")
      return `${year}-${month}-${day}T${hour}:${minute}`
    }
    return ""
  })
  const [selectedFlowId, setSelectedFlowId] = useState<string>(
    step?.flowId || "",
  )
  const [isActive, setIsActive] = useState(step?.isActive ?? false)
  const [isSaving, setIsSaving] = useState(false)
  const [_isSchedulePopoverOpen, setIsSchedulePopoverOpen] = useState(false)
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
  const [isTimeOptionsExpanded, setIsTimeOptionsExpanded] = useState(false)
  const [showFlowError, setShowFlowError] = useState(false)
  const [showDelayValueError, setShowDelayValueError] = useState(false)
  const [_showTimeRangeError, setShowTimeRangeError] = useState(false)
  const isSavingRef = useRef(false)
  const initialSendDaysRef = useRef<string[]>(selectedDays)

  const handleSave = useCallback(
    async (changedFields: {
      flowId?: string
      delayUnit?: DelayUnit
      delayValue?: number
      specificDateTime?: string
      isActive?: boolean
      anytime?: boolean
      sendTimeStart?: string | null
      sendTimeEnd?: string | null
      sendDays?: string[]
    }) => {
      if (isSavingRef.current) {
        return
      }

      if (
        changedFields.delayUnit === "specificTime" &&
        changedFields.specificDateTime
      ) {
        const currentStepTime = new Date(changedFields.specificDateTime)
        const now = new Date()

        if (currentStepTime <= now) {
          toast.error(t("sequences.timeValidation"))
          return
        }

        if (
          !isFirst &&
          previousStepTime &&
          currentStepTime <= previousStepTime
        ) {
          toast.error(t("sequences.timeValidation"))
          return
        }
      }

      isSavingRef.current = true
      setIsSaving(true)

      try {
        const payload: {
          stepId?: string
          sequenceId: string
          order: number
          flowId?: string
          isActive?: boolean
          delayDays?: number
          delayMinutes?: number
          delayUnit?: string
          specificDateTime?: string
          anytime?: boolean
          sendTimeStart?: string | null
          sendTimeEnd?: string | null
          sendDays?: string | null
        } = {
          stepId: step?.id,
          sequenceId,
          order: stepNumber - 1,
        }

        // Chỉ thêm các field thực sự thay đổi
        if (changedFields.flowId !== undefined) {
          payload.flowId = changedFields.flowId
        }

        if (changedFields.isActive !== undefined) {
          payload.isActive = changedFields.isActive
        }

        // Delay fields - nếu có thay đổi delayUnit hoặc delayValue
        if (
          changedFields.delayUnit !== undefined ||
          changedFields.delayValue !== undefined
        ) {
          const unit = changedFields.delayUnit ?? delayUnit
          const value = changedFields.delayValue ?? delayValue
          let delayDays = 0
          let delayMinutes = 0

          if (unit === "days") {
            delayDays = value
          } else if (unit === "hours") {
            delayMinutes = value * 60
          } else if (unit === "minutes") {
            delayMinutes = value
          }

          payload.delayDays = delayDays
          payload.delayMinutes = delayMinutes
          payload.delayUnit = unit
        }

        if (changedFields.specificDateTime !== undefined) {
          // Convert local datetime to UTC
          const localDate = new Date(changedFields.specificDateTime)
          payload.specificDateTime = localDate.toISOString()
          payload.delayDays = 0
          payload.delayMinutes = 0
          payload.delayUnit = "specificTime"
        }

        if (changedFields.anytime !== undefined) {
          payload.anytime = changedFields.anytime
        }

        if (changedFields.sendTimeStart !== undefined) {
          payload.sendTimeStart = changedFields.sendTimeStart
        }

        if (changedFields.sendTimeEnd !== undefined) {
          payload.sendTimeEnd = changedFields.sendTimeEnd
        }

        if (changedFields.sendDays !== undefined) {
          payload.sendDays = changedFields.sendDays
        }

        const result = await upsertSequenceStepAction(chatbotId, payload)

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
      delayUnit,
      delayValue,
      step?.id,
      t,
      isFirst,
      previousStepTime,
      chatbotId,
      sequenceId,
      stepNumber,
      onSaved,
      router,
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
    async (flowId: string) => {
      setSelectedFlowId(flowId)
      setShowFlowError(false)
      await handleSave({ flowId })
    },
    [handleSave],
  )

  const handleActiveChange = useCallback(
    async (checked: boolean) => {
      // Nếu bật switch mà chưa chọn flow, báo lỗi
      if (checked && !selectedFlowId) {
        toast.error(t("sequences.selectFlowFirst"))
        setShowFlowError(true)
        setTimeout(() => setShowFlowError(false), 3000)
        return
      }
      setShowFlowError(false)

      setIsActive(checked)

      // Chỉ lưu nếu step đã tồn tại
      if (!step?.id) {
        return
      }

      await handleSave({ isActive: checked })
    },
    [step?.id, selectedFlowId, t, handleSave],
  )

  const _handleScheduleSave = useCallback(() => {
    setIsSchedulePopoverOpen(false)
    if (!selectedFlowId) {
      return
    }

    handleSave({
      anytime: timeOption === "anytime",
      ...(timeOption === "between" && {
        sendTimeStart: startTime,
        sendTimeEnd: endTime,
      }),
      sendDays: selectedDays,
    })
  }, [handleSave, selectedFlowId, timeOption, startTime, endTime, selectedDays])

  const _getDelayText = () => {
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
    <div className="grid">
      <div className="mt-2 mb-2 space-y-4 pl-4">
        <Card className="py-2 shadow-none">
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex min-w-[320px] max-w-xl flex-1 items-center gap-2">
                <FlowSelectorSimple
                  chatbotId={chatbotId}
                  flows={flows}
                  isActive={isActive}
                  onActiveChange={handleActiveChange}
                  onSelectFlow={handleSelectFlow}
                  selectedFlowId={selectedFlowId}
                  showError={showFlowError}
                />
              </div>
              <div className="flex w-[280px] items-center gap-2">
                <span className="mr-2 ml-2 whitespace-nowrap text-muted-foreground text-sm">
                  {t("sequences.afterText")}
                </span>
                {delayUnit === "specificTime" ? (
                  <div className="flex w-full items-center gap-1">
                    <Input
                      disabled={isSaving}
                      min={getOneHourFromNowLocal()}
                      onBlur={() => {
                        if (specificDateTime && selectedFlowId) {
                          handleSave({ specificDateTime })
                        }
                      }}
                      onChange={(e) => setSpecificDateTime(e.target.value)}
                      type="datetime-local"
                      value={specificDateTime}
                    />
                    <Button
                      className="h-7 w-7 hover:bg-muted hover:text-primary"
                      onClick={() => {
                        setDelayUnit("days")
                        if (selectedFlowId) {
                          handleSave({ delayUnit: "days" })
                        }
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <RotateCcwIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex w-full gap-2">
                    {delayUnit !== "immediate" && (
                      <Input
                        className={`w-20 ${showDelayValueError ? "border-destructive" : ""}`}
                        disabled={isSaving}
                        max={99_999}
                        min={1}
                        onBlur={() => {
                          if (!delayValue || delayValue < 1) {
                            setShowDelayValueError(true)
                            return
                          }
                          setShowDelayValueError(false)
                          if (selectedFlowId) {
                            handleSave({ delayValue })
                          }
                        }}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          if (value >= 1) {
                            setDelayValue(value)
                            setShowDelayValueError(false)
                          } else {
                            setShowDelayValueError(true)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && selectedFlowId) {
                            if (!delayValue || delayValue < 1) {
                              setShowDelayValueError(true)
                              return
                            }
                            setShowDelayValueError(false)
                            handleSave({ delayValue })
                          }
                        }}
                        type="number"
                        value={delayValue}
                      />
                    )}
                    <Select
                      disabled={isSaving}
                      onValueChange={(value) => {
                        const unit = value as DelayUnit
                        setDelayUnit(unit)

                        console.log({ unit, selectedFlowId })

                        if (unit === "specificTime") {
                          const newDateTime =
                            specificDateTime || getOneHourFromNowLocal()
                          setSpecificDateTime(newDateTime)
                          handleSave({
                            delayUnit: unit,
                            specificDateTime: newDateTime,
                          })
                        } else {
                          handleSave({ delayUnit: unit })
                        }
                      }}
                      value={delayUnit}
                    >
                      <SelectTrigger className="w-[140px]">
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
                )}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  className="h-8 w-8 hover:bg-muted hover:text-primary"
                  onClick={() =>
                    setIsTimeOptionsExpanded(!isTimeOptionsExpanded)
                  }
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronDownIcon
                    className={`h-4 w-4 transition-transform ${
                      isTimeOptionsExpanded ? "rotate-180" : ""
                    }`}
                  />
                </Button>
                {!isNew && step?.id && (
                  <Button
                    className="h-8 w-8 hover:bg-muted hover:text-destructive"
                    onClick={handleDelete}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isTimeOptionsExpanded
                  ? "mt-3 max-h-[1000px] opacity-100"
                  : "max-h-0 opacity-0"
              }`}
            >
              <div className="space-y-3">
                <div className="mb-2 flex items-center space-x-2">
                  <Checkbox
                    checked={timeOption === "between"}
                    id={`time-option-${step?.id || "new"}`}
                    onCheckedChange={(checked) => {
                      const newTimeOption = checked ? "between" : "anytime"
                      setTimeOption(newTimeOption)

                      if (checked) {
                        handleSave({
                          anytime: false,
                          sendTimeStart: startTime,
                          sendTimeEnd: endTime,
                          sendDays: selectedDays,
                        })
                      } else {
                        handleSave({
                          anytime: true,
                          sendTimeStart: null,
                          sendTimeEnd: null,
                          sendDays: [...WEEKDAY_ORDER],
                        })
                      }
                    }}
                  />
                  <Label
                    className="cursor-pointer font-normal text-sm"
                    htmlFor={`time-option-${step?.id || "new"}`}
                  >
                    {t("sequences.setTimeRange")}
                  </Label>
                </div>

                {timeOption === "between" && (
                  <div className="gap-2">
                    <div className="flex items-center gap-2">
                      <Select
                        onValueChange={(value) => {
                          if (value >= endTime) {
                            setShowTimeRangeError(true)
                            return
                          }
                          setShowTimeRangeError(false)
                          setStartTime(value)
                          if (selectedFlowId) {
                            handleSave({ sendTimeStart: value })
                          }
                        }}
                        value={startTime}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => {
                            const hour = i.toString().padStart(2, "0")
                            return (
                              <SelectItem key={hour} value={`${hour}:00`}>
                                {hour}:00
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground">-</span>
                      <Select
                        onValueChange={(value) => {
                          if (startTime >= value) {
                            setShowTimeRangeError(true)
                            return
                          }
                          setShowTimeRangeError(false)
                          setEndTime(value)
                          if (selectedFlowId) {
                            handleSave({ sendTimeEnd: value })
                          }
                        }}
                        value={endTime}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => {
                            const hour = i.toString().padStart(2, "0")
                            return (
                              <SelectItem key={hour} value={`${hour}:00`}>
                                {hour}:00
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="mt-3 flex items-center">
                      <Popover
                        onOpenChange={(open) => {
                          if (open) {
                            initialSendDaysRef.current = selectedDays
                          } else {
                            const hasChanged =
                              JSON.stringify(initialSendDaysRef.current) !==
                              JSON.stringify(selectedDays)
                            if (hasChanged) {
                              const sortedDays = [...selectedDays].sort(
                                (a, b) =>
                                  WEEKDAY_ORDER.indexOf(a) -
                                  WEEKDAY_ORDER.indexOf(b),
                              )
                              handleSave({ sendDays: sortedDays })
                            }
                          }
                          setIsDayPopoverOpen(open)
                        }}
                        open={isDayPopoverOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            className="w-full justify-start font-normal"
                            variant="outline"
                          >
                            {(() => {
                              if (selectedDays.length === 7) {
                                return t("sequences.allDays")
                              }
                              if (selectedDays.length === 0) {
                                return t("sequences.selectDays")
                              }
                              return selectedDays
                                .map((d) => t(`sequences.${d}`))
                                .join(", ")
                            })()}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80">
                          <div className="space-y-3">
                            <div className="space-y-2">
                              {WEEKDAY_ORDER.map((day) => (
                                <div
                                  className="flex items-center space-x-2"
                                  key={day}
                                >
                                  <Checkbox
                                    checked={selectedDays.includes(day)}
                                    id={`day-${day}`}
                                    onCheckedChange={(checked) => {
                                      let newDays: string[]
                                      if (checked) {
                                        newDays = [...selectedDays, day]
                                      } else {
                                        newDays = selectedDays.filter(
                                          (d) => d !== day,
                                        )
                                      }
                                      newDays.sort(
                                        (a: string, b: string) =>
                                          WEEKDAY_ORDER.indexOf(a) -
                                          WEEKDAY_ORDER.indexOf(b),
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
                                const newDays =
                                  selectedDays.length === 7
                                    ? []
                                    : [...WEEKDAY_ORDER]
                                setSelectedDays(newDays)
                                setIsDayPopoverOpen(false)
                                handleSave({ sendDays: newDays })
                              }}
                              variant="outline"
                            >
                              {selectedDays.length === 7
                                ? t("sequences.deselectAll")
                                : t("sequences.allDays")}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
