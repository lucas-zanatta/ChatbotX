"use client"

import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import type {
  WhatsappPhoneNumber,
  WhatsappPhoneNumberResponse,
} from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import ky from "ky"
import { Loader2Icon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { CoexistPopup } from "@/features/shared/coexist-popup"
import { clientErrorHandler } from "@/lib/errors/client-handler"
import { connectWhatsappAction } from "../actions/connect.action"
import {
  buildBrokerEmbeddedSignupUrl,
  shouldRedirectToBroker,
} from "../libs/embedded-signup"
import { connectWhatsappSchema, type ManualOnboardingResult } from "../schemas"
import { WhatsappEmbeddedLogin } from "./whatsapp-embedded-login"
import { WhatsappOnboardingResult } from "./whatsapp-onboarding-result"

// Constants
const API_ENDPOINT = "/api/whatsapp/phone-numbers/list"
const MAX_CARD_WIDTH = "max-w-md"
const CARD_MARGIN = "mx-auto mt-40"

// Shared styling for the "Continue" embedded-signup trigger (FB button / broker link).
const CONTINUE_BUTTON_CLASS =
  "inline-flex h-8 items-center justify-start gap-2 whitespace-nowrap rounded-md bg-secondary px-4 py-2 font-medium text-secondary-foreground text-sm shadow-xs transition-all hover:bg-secondary/80 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"

// Form field names
const FORM_FIELDS = {
  WABA_ID: "wabaId",
  ACCESS_TOKEN: "accessToken",
  CONNECT_EXISTING: "connectExisting",
  TRANSFER_PHONE_NUMBER: "transferPhoneNumber",
  MANUAL_CONNECT: "manualConnect",
  MARKETING_MESSAGE_LITE: "marketingMessageLite",
  PHONE_NUMBER_ID: "phoneNumberId",
  BUSINESS_ID: "businessId",
  CODE: "code",
} as const

type FormVisibility = {
  connectExisting: boolean
  transferPhoneNumber: boolean
  manualConnect: boolean
  marketingMessageLite: boolean
}

// Custom hooks
function useFormVisibility() {
  const [visibility, setVisibility] = useState<FormVisibility>({
    connectExisting: true,
    transferPhoneNumber: true,
    manualConnect: false,
    marketingMessageLite: true,
  })

  const updateVisibility = useCallback((updates: Partial<FormVisibility>) => {
    setVisibility((prev) => ({ ...prev, ...updates }))
  }, [])

  return { visibility, updateVisibility }
}

function usePhoneNumbers() {
  const [phoneNumbers, setPhoneNumbers] = useState<WhatsappPhoneNumber[]>([])
  const [isLoading, startTransition] = useTransition()

  const clearPhoneNumbers = useCallback(() => {
    setPhoneNumbers([])
  }, [])

  return {
    phoneNumbers,
    setPhoneNumbers,
    isLoading,
    startTransition,
    clearPhoneNumbers,
  }
}

type WhatsappCreateProps = {
  workspaceId?: string | null
  settings: WhatsappCredentialPublic
}

export default function WhatsappCreate({
  workspaceId,
  settings,
}: WhatsappCreateProps) {
  const t = useTranslations()
  const { visibility, updateVisibility } = useFormVisibility()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [manualResult, setManualResult] =
    useState<ManualOnboardingResult | null>(null)
  const [showCoexist, setShowCoexist] = useState<{
    integrationId: string
    workspaceId: string
    redirectUrl: string
  } | null>(null)

  // Form setup
  const { form, handleSubmitWithAction } = useHookFormAction(
    connectWhatsappAction,
    zodResolver(connectWhatsappSchema),
    {
      actionProps: {
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
        onSuccess: ({ data }) => {
          toast.success(t("messages.connectSuccess", { feature: "Whatsapp" }))
          if (data.type === "manualResult") {
            setManualResult(data.data)
            return
          }
          if (data.isCoexist) {
            setShowCoexist({
              integrationId: data.integrationId,
              workspaceId: data.workspaceId,
              redirectUrl: data.redirectUrl,
            })
          } else {
            router.push(data.redirectUrl)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          // UI
          connectExisting: false,
          transferPhoneNumber: false,
          manualConnect: false,
          marketingMessageLite: true,
          workspaceId: workspaceId ?? "",

          // Main fields
          wabaId: "",
          businessId: "",
          phoneNumberId: "",
          accessToken: "",
          code: "",
        },
      },
    },
  )

  const { watch, setValue } = form
  const watchConnectExisting = watch(FORM_FIELDS.CONNECT_EXISTING)
  const watchTransferPhoneNumber = watch(FORM_FIELDS.TRANSFER_PHONE_NUMBER)
  const watchManualConnect = watch(FORM_FIELDS.MANUAL_CONNECT)

  // Broker relay return: the broker-hosted SDK page redirected back here with the
  // captured embedded-signup result. Populate the form and auto-submit under the
  // reseller session (where connectWhatsappAction must run). Guarded against
  // refresh/double-submit by stripping the params and a ref latch.
  const relayHandledRef = useRef(false)
  useEffect(() => {
    if (relayHandledRef.current) {
      return
    }

    const cleanUrl = `/channels/create?channel=whatsapp${
      workspaceId ? `&workspaceId=${workspaceId}` : ""
    }`

    if (searchParams.get("waError")) {
      relayHandledRef.current = true
      toast.error(t("messages.connectFailed", { feature: "Whatsapp" }))
      router.replace(cleanUrl)
      return
    }

    const waCode = searchParams.get("waCode")
    if (!waCode) {
      return
    }

    relayHandledRef.current = true
    setValue(FORM_FIELDS.CODE, waCode)
    setValue(FORM_FIELDS.WABA_ID, searchParams.get("waba_id") ?? "")
    setValue(
      FORM_FIELDS.PHONE_NUMBER_ID,
      searchParams.get("phone_number_id") ?? "",
    )
    setValue(FORM_FIELDS.BUSINESS_ID, searchParams.get("business_id") ?? "")
    setValue(
      FORM_FIELDS.TRANSFER_PHONE_NUMBER,
      searchParams.get("transferPhoneNumber") === "true",
    )
    setValue(FORM_FIELDS.CONNECT_EXISTING, false)
    setValue(FORM_FIELDS.MANUAL_CONNECT, false)
    setValue(FORM_FIELDS.MARKETING_MESSAGE_LITE, true)

    router.replace(cleanUrl)
    handleSubmitWithAction()
  }, [searchParams, setValue, handleSubmitWithAction, router, workspaceId, t])

  // Form visibility effects
  useEffect(() => {
    updateVisibility({
      transferPhoneNumber: !watchConnectExisting,
      manualConnect: watchConnectExisting,
    })

    if (!watchConnectExisting) {
      setValue(FORM_FIELDS.MANUAL_CONNECT, false)
    }
  }, [watchConnectExisting, setValue, updateVisibility])

  useEffect(() => {
    if (watchTransferPhoneNumber) {
      updateVisibility({
        connectExisting: false,
        manualConnect: false,
        marketingMessageLite: true,
      })
      setValue(FORM_FIELDS.MANUAL_CONNECT, false)
    } else {
      updateVisibility({
        connectExisting: true,
        transferPhoneNumber: true,
        manualConnect: false,
        marketingMessageLite: true,
      })
    }
  }, [watchTransferPhoneNumber, setValue, updateVisibility])

  if (showCoexist) {
    return (
      <CoexistPopup
        channel="whatsapp"
        integrationId={showCoexist.integrationId}
        onDone={() => router.push(showCoexist.redirectUrl)}
        workspaceId={showCoexist.workspaceId}
      />
    )
  }

  return (
    <Card className={`${CARD_MARGIN} ${MAX_CARD_WIDTH}`}>
      <CardHeader>
        <CardTitle>
          <InboxIcon channel="whatsapp" size="large" />
        </CardTitle>
        <CardDescription />
      </CardHeader>
      <CardContent>
        {manualResult ? (
          <WhatsappOnboardingResult result={manualResult} />
        ) : (
          <Form {...form}>
            <form className="space-y-4" onSubmit={handleSubmitWithAction}>
              {watchManualConnect ? (
                <ManualConnectSection watchManualConnect={watchManualConnect} />
              ) : (
                <SdkConnectSection
                  settings={settings}
                  visibility={visibility}
                  watchManualConnect={watchManualConnect}
                  workspaceId={workspaceId}
                />
              )}
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}

type SdkConnectSectionProps = {
  visibility: FormVisibility
  watchManualConnect: boolean
  settings: WhatsappCredentialPublic
  workspaceId?: string | null
}

function SdkConnectSection({
  visibility,
  watchManualConnect,
  settings,
  workspaceId,
}: SdkConnectSectionProps) {
  const t = useTranslations()
  const { setValue, watch, formState, trigger } = useFormContext()

  const switchFieldClassName =
    "flex items-center gap-2 flex-row-reverse justify-end"

  const finalSubmitRef = useRef<HTMLButtonElement>(null)
  const watchCode = useWatch({ name: FORM_FIELDS.CODE })
  const watchConnectExisting = useWatch({ name: FORM_FIELDS.CONNECT_EXISTING })
  const watchTransferPhoneNumber = useWatch({
    name: FORM_FIELDS.TRANSFER_PHONE_NUMBER,
  })

  // The Facebook JS SDK derives its OAuth domain from window.location, so on a
  // white-label custom domain it must run on the registered broker host instead.
  // Resolved post-mount to avoid a hydration mismatch (window is server-undefined).
  const [useBrokerRedirect, setUseBrokerRedirect] = useState(false)
  useEffect(() => {
    setUseBrokerRedirect(shouldRedirectToBroker(window.location.host))
  }, [])

  const redirectToBroker = useCallback(() => {
    window.location.href = buildBrokerEmbeddedSignupUrl({
      callbackURL: window.location.origin,
      workspaceId,
      clientId: settings.clientId,
      configId: settings.configId,
      version: settings.version,
      connectExisting: Boolean(watchConnectExisting),
      transferPhoneNumber: Boolean(watchTransferPhoneNumber),
    })
  }, [workspaceId, settings, watchConnectExisting, watchTransferPhoneNumber])

  const handleCode = useCallback(
    async (code: string) => {
      setValue(FORM_FIELDS.CODE, code)
      const valid = await trigger()
      if (valid) {
        finalSubmitRef.current?.click()
      }
    },
    [setValue, trigger],
  )

  return (
    <>
      {visibility.connectExisting && (
        <SwitchField
          formItemClassName={switchFieldClassName}
          label={t("whatsapp.connectExisting")}
          name={FORM_FIELDS.CONNECT_EXISTING}
          required
        />
      )}

      {visibility.transferPhoneNumber && (
        <SwitchField
          formItemClassName={switchFieldClassName}
          label={t("whatsapp.transferPhoneNumber")}
          name={FORM_FIELDS.TRANSFER_PHONE_NUMBER}
          required
        />
      )}

      {visibility.manualConnect && (
        <ManualConnectSection watchManualConnect={watchManualConnect} />
      )}

      <div className="flex items-center justify-end gap-2">
        {!(watchManualConnect || watch(FORM_FIELDS.CODE)) &&
          (useBrokerRedirect ? (
            <Button
              className={CONTINUE_BUTTON_CLASS}
              onClick={redirectToBroker}
              type="button"
            >
              {t("actions.continue")}
            </Button>
          ) : (
            <WhatsappEmbeddedLogin
              className={CONTINUE_BUTTON_CLASS}
              connectExisting={Boolean(watchConnectExisting)}
              label={t("actions.continue")}
              onCancel={() => {
                setValue(FORM_FIELDS.BUSINESS_ID, "")
                setValue(FORM_FIELDS.WABA_ID, "")
                setValue(FORM_FIELDS.PHONE_NUMBER_ID, "")
                toast.error(
                  t("messages.connectFailed", { feature: "Whatsapp" }),
                )
              }}
              onCode={handleCode}
              onFail={() => {
                toast.error(
                  t("messages.connectFailed", { feature: "Whatsapp" }),
                )
              }}
              onSessionInfo={(info) => {
                setValue(FORM_FIELDS.BUSINESS_ID, info.businessId)
                setValue(FORM_FIELDS.WABA_ID, info.wabaId)
                setValue(FORM_FIELDS.PHONE_NUMBER_ID, info.phoneNumberId)
              }}
              settings={settings}
              transferPhoneNumber={Boolean(watchTransferPhoneNumber)}
            />
          ))}

        {watchCode && (
          <div className="flex items-center justify-end gap-2">
            <Button
              disabled={formState.isSubmitting}
              ref={finalSubmitRef}
              size="sm"
              type="submit"
              variant="secondary"
            >
              {formState.isSubmitting && (
                <Loader2Icon className="animate-spin" />
              )}
              {t("actions.continue")}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

type ManualConnectSectionProps = {
  watchManualConnect: boolean
}

function ManualConnectSection({
  watchManualConnect,
}: ManualConnectSectionProps) {
  const t = useTranslations()
  const switchFieldClassName =
    "flex items-center gap-2 flex-row-reverse justify-end"

  const { setValue, getValues, formState } = useFormContext()

  const {
    phoneNumbers,
    setPhoneNumbers,
    isLoading: isLoadingPhoneNumbers,
    startTransition: startTransitionPhoneNumbers,
    clearPhoneNumbers,
  } = usePhoneNumbers()

  useEffect(() => {
    if (!watchManualConnect) {
      clearPhoneNumbers()

      setValue(FORM_FIELDS.WABA_ID, "")
      setValue(FORM_FIELDS.ACCESS_TOKEN, "")
      setValue(FORM_FIELDS.PHONE_NUMBER_ID, "")
    }
  }, [watchManualConnect, clearPhoneNumbers, setValue])

  // Event handlers
  const handleListPhoneNumbers = useCallback(() => {
    if (!(getValues().wabaId && getValues().accessToken)) {
      toast.error(t("whatsapp.fillRequiredFields"))
      return
    }

    startTransitionPhoneNumbers(async () => {
      try {
        const formData = getValues()
        const response = await ky
          .post<WhatsappPhoneNumberResponse>(API_ENDPOINT, {
            json: {
              wabaId: formData.wabaId ?? "",
              accessToken: formData.accessToken ?? "",
            },
          })
          .json()

        setPhoneNumbers(response.data)

        if (response.data.length === 0) {
          toast.error(t("fields.phoneNumberId.noPhoneNumbersFound"))
        }
      } catch (error) {
        await clientErrorHandler(error)
      }
    })
  }, [getValues, startTransitionPhoneNumbers, setPhoneNumbers, t])

  return (
    <>
      <SwitchField
        formItemClassName={switchFieldClassName}
        label={t("whatsapp.manualConnect")}
        name={FORM_FIELDS.MANUAL_CONNECT}
        required
      />

      {watchManualConnect && (
        <>
          {phoneNumbers.length === 0 && (
            <>
              <InputField
                label={t("fields.wabaId.label")}
                name={FORM_FIELDS.WABA_ID}
                required
              />

              <InputField
                label={t("fields.accessToken.label")}
                name={FORM_FIELDS.ACCESS_TOKEN}
                required
              />

              <div className="flex items-center justify-end gap-2">
                <Button
                  onClick={handleListPhoneNumbers}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {isLoadingPhoneNumbers && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.continue")}
                </Button>
              </div>
            </>
          )}

          {phoneNumbers.length > 0 && (
            <>
              <RadioGroupField
                label={t("fields.phoneNumberId.label")}
                name={FORM_FIELDS.PHONE_NUMBER_ID}
                options={phoneNumbers.map((pn) => ({
                  value: pn.id,
                  label: pn.display_phone_number,
                }))}
                required
              />

              <div className="flex items-center justify-end gap-2">
                <Button
                  disabled={!formState.isValid || formState.isSubmitting}
                  size="sm"
                  type="submit"
                  variant="secondary"
                >
                  {formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("whatsapp.continueManualConnect")}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
