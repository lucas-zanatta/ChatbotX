"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useRef, useState } from "react"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { BROKER_EMBEDDED_SIGNUP_RETURN_PATH } from "../libs/embedded-signup"
import {
  type EmbeddedSignupSessionInfo,
  type EmbeddedSignupSettings,
  WhatsappEmbeddedLogin,
} from "./whatsapp-embedded-login"

const CONTINUE_BUTTON_CLASS =
  "inline-flex h-8 items-center justify-start gap-2 whitespace-nowrap rounded-md bg-secondary px-4 py-2 font-medium text-secondary-foreground text-sm shadow-xs transition-all hover:bg-secondary/80"

type WhatsappEmbeddedSignupBrokerProps = {
  settings: EmbeddedSignupSettings
  callbackURL: string
  workspaceId?: string | null
  connectExisting: boolean
  transferPhoneNumber: boolean
}

/**
 * Broker-hosted page that runs the Facebook embedded-signup SDK on the registered
 * broker origin (so Meta accepts it for white-label resellers), captures the
 * `code` + session info, then bounces to the broker return route which validates
 * the relay target and 302s back to the reseller domain where the session lives.
 */
export function WhatsappEmbeddedSignupBroker({
  settings,
  callbackURL,
  workspaceId,
  connectExisting,
  transferPhoneNumber,
}: WhatsappEmbeddedSignupBrokerProps) {
  const t = useTranslations()
  const [isRelaying, setIsRelaying] = useState(false)

  // Code and session info arrive via two independent SDK events; relay once both
  // are present (or immediately on error/cancel).
  const codeRef = useRef<string | null>(null)
  const sessionRef = useRef<EmbeddedSignupSessionInfo | null>(null)
  const relayedRef = useRef(false)

  const relay = useCallback(
    (params: Record<string, string>) => {
      if (relayedRef.current) {
        return
      }
      relayedRef.current = true
      setIsRelaying(true)

      const url = new URL(
        BROKER_EMBEDDED_SIGNUP_RETURN_PATH,
        window.location.origin,
      )
      url.searchParams.set("callbackURL", callbackURL)
      if (workspaceId) {
        url.searchParams.set("workspaceId", workspaceId)
      }
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
      window.location.href = url.toString()
    },
    [callbackURL, workspaceId],
  )

  const tryRelaySuccess = useCallback(() => {
    const code = codeRef.current
    const session = sessionRef.current
    if (!(code && session)) {
      return
    }
    relay({
      waCode: code,
      waba_id: session.wabaId,
      phone_number_id: session.phoneNumberId,
      business_id: session.businessId,
      transferPhoneNumber: String(transferPhoneNumber),
    })
  }, [relay, transferPhoneNumber])

  const relayError = useCallback(() => relay({ waError: "1" }), [relay])

  return (
    <Card className="mx-auto mt-40 max-w-md">
      <CardHeader>
        <CardTitle>
          <InboxIcon channel="whatsapp" size="large" />
        </CardTitle>
        <CardDescription>
          {t("whatsapp.embeddedSignupBrokerHint")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isRelaying ? (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-sm">
            <Loader2Icon className="animate-spin" />
            {t("whatsapp.embeddedSignupProcessing")}
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <WhatsappEmbeddedLogin
              className={CONTINUE_BUTTON_CLASS}
              connectExisting={connectExisting}
              label={t("actions.continue")}
              onCancel={relayError}
              onCode={(code) => {
                codeRef.current = code
                tryRelaySuccess()
              }}
              onFail={relayError}
              onSessionInfo={(info) => {
                sessionRef.current = info
                tryRelaySuccess()
              }}
              settings={settings}
              transferPhoneNumber={transferPhoneNumber}
            />
            <Button
              onClick={relayError}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
