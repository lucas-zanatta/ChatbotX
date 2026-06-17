import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"

/**
 * Meta-registered OAuth redirect_uri for WhatsApp embedded signup. Must live on
 * the broker host (the only origin registered with Meta), never the reseller
 * white-label domain the SDK happens to run on. Mirrors the persisted
 * `redirectUrl` built server-side in `webhook-url.ts` `buildAuthValue`.
 */
export function getEmbeddedSignupRedirectUri(): string {
  return buildBrokerCallbackUrl("/integrations/whatsapp/callback")
}
