import {
  type FilterContactStepSchema,
  filterContactStepDefaultFn,
  filterContactStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import FilterContactStepEditor from "./editor"
import FilterContactStepViewer from "./viewer"

export const filterContactStep: StepDefinition<FilterContactStepSchema> = {
  editor: FilterContactStepEditor,
  viewer: FilterContactStepViewer,
  validator: filterContactStepSchema,
  defaultFn: filterContactStepDefaultFn,
}
