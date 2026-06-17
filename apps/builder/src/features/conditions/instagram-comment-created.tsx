"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { listInstagramMediaAction } from "@/features/integration-instagram/actions/list-instagram-media.action"

type InstagramMediaOption = {
  id: string
  caption?: string
  mediaType?: string
  permalink?: string
  timestamp?: string
  thumbnailUrl?: string
}

export const InstagramCommentCreated = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-4">
      <InputField name={`${parentName}.id`} type="hidden" />
      <InputField name={`${parentName}.type`} type="hidden" />
      <InstagramMediaField name={`${parentName}.sourceId`} />
      <InputField
        label={t("trigger.fields.commentContains")}
        name={`${parentName}.value.text`}
        placeholder={t("trigger.placeholders.anyCommentText")}
      />
      <InputField name={`${parentName}.operator`} type="hidden" />
    </div>
  )
}

function InstagramMediaField({ name }: { name: string }) {
  const t = useTranslations()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [open, setOpen] = useState(false)
  const [media, setMedia] = useState<InstagramMediaOption[]>([])
  const [loaded, setLoaded] = useState(false)

  const { executeAsync, isPending } = useAction(
    listInstagramMediaAction.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const mediaById = useMemo(
    () => new Map(media.map((item) => [item.id, item])),
    [media],
  )

  const loadMedia = async () => {
    if (loaded || isPending) {
      return
    }

    const result = await executeAsync({ limit: 25 })
    if (result?.data?.data) {
      setMedia(result.data.data)
      setLoaded(true)
    }
  }

  return (
    <FormFieldWrapper
      label={t("trigger.fields.instagramMediaId")}
      name={name as never}
    >
      {(field) => {
        const value = typeof field.value === "string" ? field.value : ""
        const selectedMedia = mediaById.get(value)
        const selectedLabel = selectedMedia
          ? getMediaLabel(selectedMedia, t("trigger.placeholders.untitledPost"))
          : value || t("trigger.placeholders.anyInstagramPost")

        return (
          <Popover
            onOpenChange={(nextOpen) => {
              setOpen(nextOpen)
              if (nextOpen) {
                loadMedia().catch(() => undefined)
              }
            }}
            open={open}
          >
            <PopoverTrigger asChild>
              <Button
                className="w-full justify-between font-normal"
                type="button"
                variant="outline"
              >
                <span className="truncate">{selectedLabel}</span>
                <ChevronsUpDownIcon className="opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[520px] p-0">
              <Command>
                <CommandInput
                  placeholder={t("trigger.placeholders.searchInstagramPosts")}
                />
                <CommandList>
                  {isPending ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                      <Loader2Icon className="size-4 animate-spin" />
                      {t("trigger.loading.instagramPosts")}
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>
                        {t("trigger.empty.instagramPosts")}
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            field.onChange("")
                            setOpen(false)
                          }}
                          value="__any_instagram_post__"
                        >
                          <CheckIcon
                            className={cn(
                              "size-4",
                              value ? "opacity-0" : "opacity-100",
                            )}
                          />
                          <div className="flex min-w-0 flex-col">
                            <span>
                              {t("trigger.placeholders.anyInstagramPost")}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {t("trigger.descriptions.anyInstagramPost")}
                            </span>
                          </div>
                        </CommandItem>
                        {media.map((item) => (
                          <CommandItem
                            key={item.id}
                            onSelect={() => {
                              field.onChange(item.id)
                              setOpen(false)
                            }}
                            value={`${item.id} ${item.caption ?? ""} ${
                              item.mediaType ?? ""
                            }`}
                          >
                            <CheckIcon
                              className={cn(
                                "size-4",
                                value === item.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate">
                                {getMediaLabel(
                                  item,
                                  t("trigger.placeholders.untitledPost"),
                                )}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {formatMediaMeta(item)}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
              <div className="border-t p-3">
                <Input
                  onChange={(event) => field.onChange(event.target.value)}
                  placeholder={t("trigger.placeholders.manualInstagramMediaId")}
                  value={value}
                />
              </div>
            </PopoverContent>
          </Popover>
        )
      }}
    </FormFieldWrapper>
  )
}

function getMediaLabel(media: InstagramMediaOption, fallback: string) {
  return media.caption?.trim() || media.permalink || media.id || fallback
}

function formatMediaMeta(media: InstagramMediaOption) {
  return [
    media.mediaType,
    media.timestamp ? media.timestamp.slice(0, 10) : null,
  ]
    .filter(Boolean)
    .join(" - ")
}
