import { and, db, eq, inArray, lt } from "@aha.chat/database/client"
import { analyticsManifestStatusModel } from "@aha.chat/database/schema"
import { uploader } from "@aha.chat/filesystem"
import type { NdjsonIngestManifestStore } from "@aha.chat/filesystem/server"
import { sql } from "drizzle-orm"

export class AnalyticsManifestService implements NdjsonIngestManifestStore {
  async getS3Files(prefix: string): Promise<string[]> {
    const objects = await uploader.listObjects(prefix)
    return objects.map((obj) => obj.Key).filter((key): key is string => !!key)
  }

  async filterUnprocessedFiles(s3Keys: string[]): Promise<string[]> {
    if (s3Keys.length === 0) {
      return []
    }

    const processed = await db.query.analyticsManifestStatusModel.findMany({
      where: and(
        inArray(analyticsManifestStatusModel.objectKey, s3Keys),
        eq(analyticsManifestStatusModel.status, "ingested"),
      ),
      columns: { objectKey: true },
    })

    const processedSet = new Set(processed.map((p) => p.objectKey))
    return s3Keys.filter((key) => !processedSet.has(key))
  }

  filterNotIngested(objectKeys: string[]): Promise<string[]> {
    return this.filterUnprocessedFiles(objectKeys)
  }

  async claimForProcessing(objectKey: string): Promise<number | null> {
    try {
      const existing = await db.query.analyticsManifestStatusModel.findFirst({
        where: eq(analyticsManifestStatusModel.objectKey, objectKey),
      })

      if (
        existing?.status === "processing" ||
        existing?.status === "ingested"
      ) {
        return null
      }

      const result = await db
        .insert(analyticsManifestStatusModel)
        .values({
          objectKey,
          status: "processing",
          attempts: 1,
        })
        .onConflictDoUpdate({
          target: analyticsManifestStatusModel.objectKey,
          set: {
            status: "processing",
            attempts: sql`${analyticsManifestStatusModel.attempts} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning()
        .then((res) => res[0])

      return result.attempts
    } catch (error) {
      console.error("[AnalyticsManifestService] Failed to claim", {
        objectKey,
        error,
      })
      return null
    }
  }

  async markIngested(objectKey: string): Promise<void> {
    await db
      .update(analyticsManifestStatusModel)
      .set({
        status: "ingested",
        ingestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(analyticsManifestStatusModel.objectKey, objectKey))
  }

  async markFailed(objectKey: string, error: string): Promise<void> {
    await db
      .update(analyticsManifestStatusModel)
      .set({
        status: "failed",
        lastError: error,
        updatedAt: new Date(),
      })
      .where(eq(analyticsManifestStatusModel.objectKey, objectKey))
  }

  async deleteS3File(objectKey: string): Promise<void> {
    try {
      await uploader.deleteObject(objectKey)
    } catch (error) {
      console.error("[AnalyticsManifestService] Failed to delete S3 file", {
        objectKey,
        error,
      })
    }
  }

  async resetStuckProcessing(olderThanMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000)
    const result = await db
      .update(analyticsManifestStatusModel)
      .set({
        status: "failed",
        lastError: "Processing timeout - reset by cleanup job",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(analyticsManifestStatusModel.status, "processing"),
          lt(analyticsManifestStatusModel.updatedAt, cutoff),
        ),
      )
    return result.rowCount
  }
}

export const analyticsManifestService = new AnalyticsManifestService()
