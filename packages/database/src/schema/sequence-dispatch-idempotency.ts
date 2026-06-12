import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core"
import { bigintAsString } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const sequenceDispatchIdempotencyModel = pgTable(
  "SequenceDispatchIdempotency",
  {
    idempotencyKey: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    dispatchId: bigintAsString().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.idempotencyKey, table.workspaceId],
      name: "SequenceDispatchIdempotency_pkey",
    }),
    index("SequenceDispatchIdempotency_dispatchId_idx").on(table.dispatchId),
  ],
)
