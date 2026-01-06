"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { deleteSequenceAction } from "./actions/delete-sequence.action"
import type { SequenceResource } from "./schemas/get-sequences-schema"

export function BulkDeleteSequenceDialog({
  sequences,
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  sequences: SequenceResource[]
  onSuccess?: () => void
}) {
  const t = useTranslations()

  const [isPending, setIsPending] = useState(false)

  const handleBulkDelete = async () => {
    setIsPending(true)
    try {
      // Delete all sequences in parallel
      await Promise.all(
        sequences.map((sequence) =>
          deleteSequenceAction(sequence.chatbotId, sequence.id),
        ),
      )
      // Trigger success callback
      onOpenChange(false)
      onSuccess?.()
      toast.success(
        t("messages.deletedSuccess", {
          feature: t("fields.sequences.label"),
        }),
      )
    } catch (error) {
      console.error("Error deleting sequences:", error)
      toast.error(t("messages.unknownError"))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.sequences.label"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.deleteFeatureDescription", {
              feature: t("fields.sequences.label"),
            })}
            {sequences.length > 1 && (
              <div className="mt-2 text-sm">
                {t("messages.deleteMultipleItems", {
                  count: sequences.length,
                  feature: t("fields.sequences.label"),
                })}
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="justify-end">
          <DialogClose asChild>
            <Button size="sm" type="button" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            disabled={isPending}
            onClick={handleBulkDelete}
            size="sm"
            variant="destructive"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
