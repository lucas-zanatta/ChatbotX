import { getPublicUrlFromRequest } from "@chatbotx.io/utils"
import { NextResponse } from "next/server"
import {
  CHANNELS_CREATE_PATH,
  FALLBACK_REDIRECT_AFTER_RELAY,
} from "@/features/integration-whatsapp/libs/embedded-signup"
import { logger } from "@/lib/log"
import { sanitizeReferer } from "@/lib/oauth-referer"

const RELAYED_PARAMS = [
  "workspaceId",
  "waCode",
  "waba_id",
  "phone_number_id",
  "business_id",
  "transferPhoneNumber",
  "waError",
] as const

/**
 * Broker return route for WhatsApp embedded signup. The broker-hosted SDK page
 * (running on the registered broker origin) bounces here with the captured
 * `code` + session info and the originating reseller's `callbackURL`. We validate
 * the callbackURL against origins we control (open-redirect guard, shared with the
 * #601 OAuth-broker relay) and 302 back to the reseller `/channels/create`, where
 * the session cookie lives and `connectWhatsappAction` can run.
 */
export async function GET(req: Request) {
  const url = new URL(getPublicUrlFromRequest(req))
  const callbackURL = url.searchParams.get("callbackURL") ?? ""

  // sanitizeReferer returns the URL only when it is an origin we control
  // (broker host, builder host, or an active custom domain); otherwise a safe
  // in-app fallback path — never an attacker-supplied origin.
  const safeTarget = await sanitizeReferer(callbackURL)
  if (!safeTarget.startsWith("http")) {
    logger.warn({ callbackURL }, "[wa-embedded-signup] rejected relay target")
    return NextResponse.redirect(
      new URL(FALLBACK_REDIRECT_AFTER_RELAY, url.origin),
    )
  }

  const target = new URL(CHANNELS_CREATE_PATH, new URL(safeTarget).origin)
  target.searchParams.set("channel", "whatsapp")
  for (const key of RELAYED_PARAMS) {
    const value = url.searchParams.get(key)
    if (value) {
      target.searchParams.set(key, value)
    }
  }

  return NextResponse.redirect(target)
}
