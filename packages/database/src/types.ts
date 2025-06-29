import { z } from "zod"

export * from "../generated/client"

export const OMNICHANNEL = "OMNICHANNEL"

export enum CustomFieldOperation {
  SET = "SET",
  APPEND = "APPEND",
  PREPEND = "PREPEND",
}

export const filterOperators = z.enum([
  "EQ",
  "NE",
  "HAS_ANY_VALUE",
  "HAS_NO_VALUE",
  "GT",
  "LT",
  "GTE",
  "LTE",
  "CONTAINS",
  "NOT_CONTAIN",
  "STARTS_WITH",
  "ENDS_WITH",
  "INTERVAL",
  "NOT_INTERVAL",
  "INTERVAL",
  "NOT_INTERVAL",
])
export type FilterOperator = z.infer<typeof filterOperators>
