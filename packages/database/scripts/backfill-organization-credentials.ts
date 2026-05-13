/**
 * Backfill OrganizationCredential rows from legacy Organization.settings jsonb.
 *
 * For each organization, for each provider key present in `settings`, insert an
 * OrganizationCredential row of the corresponding type unless one already
 * exists (idempotent — safe to re-run). Runs inside a per-org transaction.
 *
 * Usage: pnpm --filter @chatbotx.io/database backfill:organization-credentials
 */
import { encryptUtils } from "@chatbotx.io/encryption"
import { and, eq } from "drizzle-orm"
import { db } from "../src/client"
import {
  type OrganizationCredentialByType,
  type OrganizationCredentialType,
  organizationCredentialPublicSchemas,
} from "../src/partials/organization-credential"
import { organizationModel } from "../src/schema/organization"
import { organizationCredentialModel } from "../src/schema/organization-credential"

const main = async (): Promise<void> => {
  const organizations = await db
    .select({
      id: organizationModel.id,
      settings: organizationModel.settings,
    })
    .from(organizationModel)

  let totalInserted = 0
  let totalSkipped = 0

  for (const org of organizations) {
    const settings = org.settings
    if (!settings) {
      continue
    }

    const candidates: {
      type: OrganizationCredentialType
      config:
        | OrganizationCredentialByType[OrganizationCredentialType]
        | undefined
    }[] = [
      { type: "whatsapp", config: settings.whatsapp },
      { type: "messenger", config: settings.messenger },
      { type: "instagram", config: settings.instagram },
      { type: "google", config: settings.google },
      { type: "zalo", config: settings.zalo },
      { type: "giphy", config: settings.giphy },
      { type: "stripe", config: settings.stripe },
    ]

    await db.transaction(async (tx) => {
      for (const { type, config } of candidates) {
        if (!config) {
          continue
        }

        const existing = await tx
          .select({ id: organizationCredentialModel.id })
          .from(organizationCredentialModel)
          .where(
            and(
              eq(organizationCredentialModel.organizationId, org.id),
              eq(organizationCredentialModel.type, type),
            ),
          )
          .limit(1)
          .then((rows) => rows[0])

        if (existing) {
          totalSkipped += 1
          continue
        }

        const publicConfig =
          organizationCredentialPublicSchemas[type].parse(config)
        const value = encryptUtils.encryptObject(config)

        await tx.insert(organizationCredentialModel).values({
          organizationId: org.id,
          type,
          publicConfig,
          value,
        })
        totalInserted += 1
      }
    })
  }

  console.log(
    `Backfill complete: ${totalInserted} inserted, ${totalSkipped} skipped.`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error)
    process.exit(1)
  })
