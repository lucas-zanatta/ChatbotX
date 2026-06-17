"use client"

import FacebookLogin, {
  type InitParams,
} from "@greatsumini/react-facebook-login"
import { useEffect } from "react"
import {
  buildEmbeddedSignupExtras,
  resolveEmbeddedSignupFeatureType,
} from "../libs/embedded-signup"

const DEFAULT_VERSION: InitParams["version"] = "v21.0"

export type EmbeddedSignupSessionInfo = {
  businessId: string
  wabaId: string
  phoneNumberId: string
}

/** The subset of the WhatsApp public credential the embedded-signup SDK needs. */
export type EmbeddedSignupSettings = {
  clientId: string
  configId: string
  version: string
}

type WhatsappEmbeddedLoginProps = {
  settings: EmbeddedSignupSettings
  connectExisting: boolean
  transferPhoneNumber: boolean
  label: string
  className?: string
  onCode: (code: string) => void
  onSessionInfo: (info: EmbeddedSignupSessionInfo) => void
  onCancel: () => void
  onFail: () => void
}

/**
 * Renders the Facebook embedded-signup button via `@greatsumini/react-facebook-login`
 * and captures the `WA_EMBEDDED_SIGNUP` postMessage that carries the
 * waba_id / phone_number_id / business_id (these only arrive via postMessage, not
 * via a plain OAuth redirect). Used both inline (platform host) and on the broker
 * page (white-label), so the SDK config lives in exactly one place.
 */
export function WhatsappEmbeddedLogin({
  settings,
  connectExisting,
  transferPhoneNumber,
  label,
  className,
  onCode,
  onSessionInfo,
  onCancel,
  onFail,
}: WhatsappEmbeddedLoginProps) {
  const featureType = resolveEmbeddedSignupFeatureType({
    connectExisting,
    transferPhoneNumber,
  })

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) {
        return
      }

      try {
        const data = JSON.parse(event.data)
        if (data.type !== "WA_EMBEDDED_SIGNUP") {
          return
        }

        if (
          data.event === "FINISH" ||
          data.event === "FINISH_ONLY_WABA" ||
          data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
        ) {
          onSessionInfo({
            businessId: data.data?.business_id ?? "",
            wabaId: data.data?.waba_id ?? "",
            phoneNumberId: data.data?.phone_number_id ?? "",
          })
        } else if (data.event === "CANCEL") {
          onCancel()
        }
      } catch {
        // Ignore malformed postMessage payloads from the Facebook SDK
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [onSessionInfo, onCancel])

  return (
    <FacebookLogin
      appId={settings.clientId}
      className={className}
      initParams={{
        version: (settings.version as InitParams["version"]) ?? DEFAULT_VERSION,
      }}
      key={featureType ?? "default"}
      loginOptions={
        {
          config_id: settings.configId,
          response_type: "code",
          override_default_response_type: true,
          return_scopes: true,
          extras: buildEmbeddedSignupExtras(featureType),
          // biome-ignore lint/suspicious/noExplicitAny: some SDK types are not supported
        } as any
      }
      onFail={onFail}
      // biome-ignore lint/suspicious/noExplicitAny: this library does not type the returned code
      onSuccess={(res: any) => {
        if (res?.code) {
          onCode(res.code)
        }
      }}
      scope=""
    >
      {label}
    </FacebookLogin>
  )
}
