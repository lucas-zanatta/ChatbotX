import { env } from "@/env"
import { getBrokerOrigin, isBrokerHost } from "@/lib/oauth-broker"

/**
 * WhatsApp embedded-signup helpers.
 *
 * The Facebook JS SDK derives its OAuth domain/origin from `window.location`, not
 * from any prop — so on a reseller white-label custom domain (which is not
 * registered with Meta) the SDK is rejected. The only registered origin is the
 * broker host. The fix is to run the SDK on the broker host and relay the result
 * back to the originating domain (mirrors the #601 OAuth-broker relay pattern).
 */

export const EMBEDDED_SIGNUP_FEATURE_TYPES = {
  WHATSAPP_BUSINESS_APP_ONBOARDING: "whatsapp_business_app_onboarding",
  ONLY_WABA_SHARING: "only_waba_sharing",
} as const

export const EMBEDDED_SIGNUP_FEATURES = {
  MARKETING_MESSAGES_LITE: "marketing_messages_lite",
} as const

/** The broker-hosted page that runs the embedded-signup SDK. */
export const BROKER_EMBEDDED_SIGNUP_PATH =
  "/integrations/whatsapp/embedded-signup"

/** The broker route that validates the relay target and 302s back to the reseller. */
export const BROKER_EMBEDDED_SIGNUP_RETURN_PATH =
  "/integrations/whatsapp/embedded-signup/return"

/** Where the reseller resumes after the relay (carries the captured params). */
export const CHANNELS_CREATE_PATH = "/channels/create"

/** Safe in-app fallback when the relay target fails the open-redirect guard. */
export const FALLBACK_REDIRECT_AFTER_RELAY = "/manage"

/**
 * Derive Meta's embedded-signup `featureType` from the user's intent. Mirrors the
 * original inline logic: transfer (coexist) onboarding vs. existing-WABA sharing.
 */
export function resolveEmbeddedSignupFeatureType(params: {
  connectExisting: boolean
  transferPhoneNumber: boolean
}): string | undefined {
  if (params.transferPhoneNumber) {
    return EMBEDDED_SIGNUP_FEATURE_TYPES.WHATSAPP_BUSINESS_APP_ONBOARDING
  }
  if (params.connectExisting) {
    return EMBEDDED_SIGNUP_FEATURE_TYPES.ONLY_WABA_SHARING
  }
  return
}

/** The exact `loginOptions.extras` object Meta expects for embedded signup. */
export function buildEmbeddedSignupExtras(featureType?: string) {
  return {
    sessionInfoVersion: 3,
    setup: {},
    features: [EMBEDDED_SIGNUP_FEATURES.MARKETING_MESSAGES_LITE],
    ...(featureType ? { featureType } : {}),
  }
}

/**
 * Whether the SDK must run on the broker host instead of the current domain.
 * True only when a dedicated broker is configured and we are not already on it
 * (platform / single-domain deploys keep running the SDK inline).
 */
export function shouldRedirectToBroker(host: string): boolean {
  return Boolean(env.NEXT_PUBLIC_BROKER_URL) && !isBrokerHost(host)
}

export type BrokerEmbeddedSignupParams = {
  callbackURL: string
  workspaceId?: string | null
  clientId: string
  configId: string
  version: string
  connectExisting: boolean
  transferPhoneNumber: boolean
}

/**
 * Build the absolute broker URL the reseller redirects to. The SDK config
 * (clientId/configId/version) is already public (it ships in the browser today),
 * so passing it in the query is no new exposure — and the broker cannot resolve
 * it from the DB itself, since it runs in the ROOT tenant (invariant #10).
 */
export function buildBrokerEmbeddedSignupUrl(
  params: BrokerEmbeddedSignupParams,
): string {
  const url = new URL(BROKER_EMBEDDED_SIGNUP_PATH, getBrokerOrigin())
  url.searchParams.set("callbackURL", params.callbackURL)
  if (params.workspaceId) {
    url.searchParams.set("workspaceId", params.workspaceId)
  }
  url.searchParams.set("clientId", params.clientId)
  url.searchParams.set("configId", params.configId)
  url.searchParams.set("version", params.version)
  url.searchParams.set("connectExisting", String(params.connectExisting))
  url.searchParams.set(
    "transferPhoneNumber",
    String(params.transferPhoneNumber),
  )
  return url.toString()
}
