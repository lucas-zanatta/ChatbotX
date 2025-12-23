"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@aha.chat/ui/components/ui/alert-dialog"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@aha.chat/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import { cn } from "@aha.chat/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CheckIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { createFlowAction } from "@/features/flows/actions/create-flow-action"
import { useFlowStore } from "@/features/flows/provider/flow-store-context"
import { createFlowSchema } from "@/features/flows/schemas/create-flow-schema"

type FlowSelectorSimpleProps = {
  flows: Array<{ id: string; name: string }>
  chatbotId: string
  selectedFlowId: string
  onSelectFlow: (flowId: string) => void
  isActive?: boolean
  onActiveChange?: (active: boolean) => void
  onDelete?: () => void
  isNew?: boolean
  showError?: boolean
}

export function FlowSelectorSimple({
  flows,
  chatbotId,
  selectedFlowId,
  onSelectFlow,
  isActive,
  onActiveChange,
  onDelete,
  isNew,
  showError,
}: FlowSelectorSimpleProps) {
  const t = useTranslations()
  const [_createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectPopoverOpen, setSelectPopoverOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const getAllActiveFlows = useFlowStore((state) => state.getAllActiveFlows)

  const selectedFlow = flows.find((f) => f.id === selectedFlowId)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createFlowAction.bind(null, chatbotId),
      zodResolver(createFlowSchema),
      {
        actionProps: {
          onSuccess: async ({ data }) => {
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.flow.label"),
              }),
            )
            await getAllActiveFlows(chatbotId)
            if (data?.flowId) {
              onSelectFlow(data.flowId)
            }
            setCreateDialogOpen(false)
            resetFormAndAction()
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
            folderId: null,
          },
        },
        errorMapProps: {},
      },
    )

  const handleSelectFlow = (flowId: string) => {
    onSelectFlow(flowId)
    setSelectPopoverOpen(false)
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full items-center gap-2">
        {isActive !== undefined && onActiveChange && (
          <Switch checked={isActive} onCheckedChange={onActiveChange} />
        )}

        <span className="mr-4 ml-4 text-muted-foreground text-sm">
          {t("sequences.sendLabel")}
        </span>

        <Popover onOpenChange={setSelectPopoverOpen} open={selectPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              className={cn(
                "flex-1 justify-start",
                showError && "border-destructive ring-2 ring-destructive/20",
              )}
              type="button"
              variant="outline"
            >
              {selectedFlow?.name || t("sequences.selectFlow")}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[400px] p-0">
            <Command>
              <CommandInput placeholder={t("sequences.searchFlow")} />
              <CommandList>
                <CommandEmpty>{t("messages.noItemsFound")}</CommandEmpty>
                <CommandGroup>
                  {flows.map((flow) => (
                    <CommandItem
                      key={flow.id}
                      onSelect={() => handleSelectFlow(flow.id)}
                      value={flow.name}
                    >
                      <CheckIcon
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedFlowId === flow.id
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {flow.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {onDelete && (
          <AlertDialog
            onOpenChange={setDeleteDialogOpen}
            open={deleteDialogOpen}
          >
            <AlertDialogTrigger asChild>
              <Button
                className="h-8 w-8 hover:bg-muted hover:text-destructive"
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2Icon className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("sequences.confirmDeleteStep")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("dialog.deleteConfirmation", {
                    feature: t("sequences.step").toLowerCase(),
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>
                  {t("actions.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  )
}
