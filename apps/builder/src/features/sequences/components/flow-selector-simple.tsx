"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Label } from "@aha.chat/ui/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { cn } from "@aha.chat/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { createFlowAction } from "@/features/flows/actions/create-flow-action"
import { createFlowSchema } from "@/features/flows/schemas/create-flow-schema"

type FlowSelectorSimpleProps = {
  flows: Array<{ id: string; name: string }>
  chatbotId: string
  selectedFlowId: string
  onSelectFlow: (flowId: string) => void
}

export function FlowSelectorSimple({
  flows,
  chatbotId,
  selectedFlowId,
  onSelectFlow,
}: FlowSelectorSimpleProps) {
  const t = useTranslations()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectPopoverOpen, setSelectPopoverOpen] = useState(false)

  const selectedFlow = flows.find((f) => f.id === selectedFlowId)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createFlowAction.bind(null, chatbotId),
      zodResolver(createFlowSchema),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.flow.label"),
              }),
            )
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
    <div className="flex flex-col gap-2">
      <Label>{t("sequences.selectFlow")}</Label>
      <div className="flex gap-2">
        <Dialog onOpenChange={setCreateDialogOpen} open={createDialogOpen}>
          <Button
            className="flex-1"
            onClick={() => setCreateDialogOpen(true)}
            type="button"
            variant="outline"
          >
            {t("sequences.createNewReply")}
          </Button>
          <DialogContent className="max-h-screen max-w-sm overflow-y-scroll">
            <DialogHeader>
              <DialogTitle>
                {t("messages.createFeature", {
                  feature: t("fields.flow.label"),
                })}
              </DialogTitle>
              <DialogDescription />
            </DialogHeader>
            <Form {...form}>
              <form
                className="flex-1 space-y-6"
                onSubmit={handleSubmitWithAction}
              >
                <InputField
                  label={t("fields.name.label")}
                  name="name"
                  required
                />

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="ghost">
                      {t("actions.cancel")}
                    </Button>
                  </DialogClose>
                  <Button
                    disabled={
                      !form.formState.isValid || form.formState.isSubmitting
                    }
                    type="submit"
                  >
                    {form.formState.isSubmitting && (
                      <Loader2Icon className="animate-spin" />
                    )}
                    {t("actions.confirm")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Popover onOpenChange={setSelectPopoverOpen} open={selectPopoverOpen}>
          <PopoverTrigger asChild>
            <Button className="flex-1" type="button" variant="outline">
              {selectedFlow?.name || t("sequences.selectExisting")}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[300px] p-0">
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
      </div>
      {selectedFlow && (
        <p className="text-muted-foreground text-sm">
          {t("sequences.selectedFlow")}:{" "}
          <span className="font-medium">{selectedFlow.name}</span>
        </p>
      )}
    </div>
  )
}
