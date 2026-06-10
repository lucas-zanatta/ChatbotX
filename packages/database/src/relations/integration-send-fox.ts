import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationSendFoxRelations = defineRelationsPart(schema, (r) => ({
  integrationSendFoxModel: {
    integration: r.one.integrationModel({
      from: r.integrationSendFoxModel.integrationId,
      to: r.integrationModel.id,
    }),
    workspace: r.one.workspaceModel({
      from: r.integrationSendFoxModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
