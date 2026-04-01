import { broadcastWorkspaceTokenAPIs } from "./workspace-token"
import { broadcastPrivateAPIs } from "./private"

export const broadcastAPIs = {
  ...broadcastWorkspaceTokenAPIs,
  ...broadcastPrivateAPIs,
}
