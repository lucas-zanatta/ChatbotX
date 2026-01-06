export type SequenceFolder = {
  id: string
  name: string
  parentId?: string | null
  depth?: number
  _count?: {
    sequencesOnFolders?: number
    totalSequences?: number
    children?: number
  }
}
