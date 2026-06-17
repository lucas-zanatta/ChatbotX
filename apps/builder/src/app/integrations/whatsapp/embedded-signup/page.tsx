import { notFound } from "next/navigation"
import { WhatsappEmbeddedSignupBroker } from "@/features/integration-whatsapp/components/whatsapp-embedded-signup-broker"

export const dynamic = "force-dynamic"

type EmbeddedSignupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

/**
 * Broker-hosted WhatsApp embedded-signup page (public — under the `/integrations`
 * prefix, no session). Runs the Facebook SDK on the registered broker origin for
 * white-label resellers. The SDK config (clientId/configId/version) is public and
 * passed in by the originating reseller page; the broker runs in the ROOT tenant
 * and cannot resolve it from the DB itself (invariant #10).
 */
export default async function WhatsappEmbeddedSignupPage(
  props: EmbeddedSignupPageProps,
) {
  const searchParams = await props.searchParams

  const callbackURL = readParam(searchParams, "callbackURL")
  const clientId = readParam(searchParams, "clientId")
  const configId = readParam(searchParams, "configId")
  const version = readParam(searchParams, "version")

  if (!(callbackURL && clientId && configId && version)) {
    return notFound()
  }

  return (
    <WhatsappEmbeddedSignupBroker
      callbackURL={callbackURL}
      connectExisting={readParam(searchParams, "connectExisting") === "true"}
      settings={{ clientId, configId, version }}
      transferPhoneNumber={
        readParam(searchParams, "transferPhoneNumber") === "true"
      }
      workspaceId={readParam(searchParams, "workspaceId")}
    />
  )
}
