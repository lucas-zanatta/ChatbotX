"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent, CardTitle } from "@aha.chat/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { FolderPlus, Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { createSequenceFolderAction } from "../actions/create-sequence-folder.action"
import { createSequenceFolderRequest } from "../schemas/sequence-folder-schema"

type CreateSequenceFolderDialogProps = {
  chatbotId: string
  variant?: "button" | "card"
  currentFolderId?: string | null
}

export function CreateSequenceFolderDialog({
  chatbotId,
  variant = "button",
  currentFolderId,
}: CreateSequenceFolderDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createSequenceFolderAction.bind(null, chatbotId),
      zodResolver(createSequenceFolderRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(t("sequences.folders.created"))
            resetFormAndAction()
            setOpen(false)
            router.refresh()
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
            parentId: currentFolderId ?? null,
          },
        },
        errorMapProps: {},
      },
    )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {variant === "button" ? (
          <Button size="sm">
            <PlusIcon className="h-4 w-4" />
            {t("sequences.folders.createNew")}
          </Button>
        ) : (
          <Card className="group cursor-pointer border border-input border-dashed bg-background/50 py-2 shadow-none transition-colors hover:bg-muted/30">
            <CardContent className="flex min-h-[30px] items-center gap-1.5 px-4 py-0">
              <FolderPlus className="h-5 w-5 font-bold text-muted-foreground transition-colors group-hover:text-primary" />
              <CardTitle className="truncate font-normal text-[13px] leading-tight group-hover:text-primary">
                {t("sequences.folders.createNew")}
              </CardTitle>
            </CardContent>
          </Card>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sequences.folders.createNew")}</DialogTitle>
          <DialogDescription>
            {t("sequences.folders.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4 py-4" onSubmit={handleSubmitWithAction}>
            <InputField
              label={t("fields.name.label")}
              name="name"
              placeholder={t("fields.name.placeholder")}
              required
            />
            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
