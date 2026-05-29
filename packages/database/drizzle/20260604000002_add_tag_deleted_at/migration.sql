ALTER TABLE "Tag" ADD COLUMN "deletedAt" timestamp(6) with time zone;
DROP INDEX IF EXISTS "Tag_workspaceId_name_key";
CREATE UNIQUE INDEX "Tag_workspaceId_name_key" ON "Tag" USING btree ("workspaceId" ASC NULLS LAST, "name" ASC NULLS LAST) WHERE "deletedAt" IS NULL;
