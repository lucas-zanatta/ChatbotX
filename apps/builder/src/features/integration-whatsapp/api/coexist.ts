import { and, db, eq, sql } from "@chatbotx.io/database/client"
import {
  coexistSyncRunModel,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { triggerSmbAppDataSync } from "@chatbotx.io/integration-whatsapp/api/coexists"
import { z } from "zod"
import { logger } from "@/lib/log"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const setCoexistWhatsappRequest = z.object({
  workspaceId: z.string(),
  integrationId: z.string(),
  enabled: z.boolean(),
})

export const integrationWhatsappCoexistAPIs = {
  setCoexistWhatsappAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/integrations/whatsapp/{integrationId}/coexist",
      summary: "Enable or disable WhatsApp coexist sync",
      tags: ["Integrations"],
    })
    .input(setCoexistWhatsappRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, integrationId, enabled } = input

      // Atomic UPDATE + RETURNING gates on workspaceId (tenancy) and yields
      // phoneNumberId + auth in one round trip — no separate findFirst, no
      // race window between flag write and queue enqueue.
      const [updated] = await db
        .update(integrationWhatsappModel)
        .set({ coexistEnabled: enabled })
        .where(
          and(
            eq(integrationWhatsappModel.id, integrationId),
            eq(integrationWhatsappModel.workspaceId, workspaceId),
          ),
        )
        .returning({
          phoneNumberId: integrationWhatsappModel.phoneNumberId,
          auth: integrationWhatsappModel.auth,
        })

      if (!updated) {
        return { success: false as const }
      }

      if (enabled) {
        const [run] = await db
          .insert(coexistSyncRunModel)
          .values({
            workspaceId: input.workspaceId,
            integrationId: input.integrationId,
            channel: "whatsapp",
            status: "init",
            triggerSource: "popup-enable",
          })
          .returning({ id: coexistSyncRunModel.id })

        // Per Meta docs ("Synchronizing WhatsApp Business app data"), webhook
        // subscription alone does NOT cause Meta to push history/contact
        // payloads. The integrating app must POST /{phone-number-id}/smb_app_data
        // with sync_type once per onboarding (24h window). Without these
        // calls, the staging table stays empty forever.
        const auth = updated.auth as WhatsappAuthValue
        const phoneNumberId = updated.phoneNumberId
        try {
          const stateResult = await triggerSmbAppDataSync({
            auth,
            phoneNumberId,
            syncType: "smb_app_state_sync",
          })
          const historyResult = await triggerSmbAppDataSync({
            auth,
            phoneNumberId,
            syncType: "history",
          })

          if (!(stateResult.ok && historyResult.ok)) {
            let reason:
              | "already_triggered"
              | "window_expired"
              | "not_eligible"
              | null = null
            if (!stateResult.ok) {
              reason = stateResult.reason
            } else if (!historyResult.ok) {
              reason = historyResult.reason
            }
            if (reason && run) {
              await db
                .update(coexistSyncRunModel)
                .set({
                  status: "failed",
                  currentError: `smb_app_data ${reason}`,
                  finishedAt: new Date(),
                })
                .where(eq(coexistSyncRunModel.id, run.id))
            }
            return { success: false as const, reason }
          }
        } catch (err) {
          logger.error({ err, integrationId }, "smb_app_data trigger failed")
          if (run) {
            await db
              .update(coexistSyncRunModel)
              .set({
                status: "failed",
                currentError:
                  err instanceof Error ? err.message : "smb_app_data error",
                finishedAt: new Date(),
              })
              .where(eq(coexistSyncRunModel.id, run.id))
          }
          return { success: false as const, reason: "trigger_failed" as const }
        }
      } else {
        // Chunked DELETE: Postgres does not support LIMIT on DELETE directly;
        // use a ctid subquery to delete at most BATCH rows per iteration so
        // large staging tables cannot hold a long exclusive lock.
        const BATCH = 100
        for (;;) {
          const result = await db.execute(sql`
            DELETE FROM "WhatsappCoexistStaging"
            WHERE ctid IN (
              SELECT ctid FROM "WhatsappCoexistStaging"
              WHERE "phoneNumberId" = ${updated.phoneNumberId}
              LIMIT ${BATCH}
            )
          `)
          if ((result.rowCount ?? 0) < BATCH) {
            break
          }
        }
      }

      return { success: true as const }
    }),
}
