import type {
  ContactCustomFieldModel,
  ContactModel,
  ContactNoteModel,
  ContactsOnSequenceModel,
  CustomFieldType,
  SequenceModel,
  TagModel,
} from "@aha.chat/database/types"
import type { LucideIcon } from "lucide-react"
import type { ConversationResource } from "@/features/conversations/schemas/resource"
import { BaseException } from "@/lib/errors/exception"

export class ContactException extends BaseException {}

export type ContactResource = ContactModel & {
  contactCustomFields?: ContactCustomFieldModel[]
  tags?: TagModel[]
  sequences?: SequenceModel[]
  contactsOnSequences?: (ContactsOnSequenceModel & {
    sequence: SequenceModel
  })[]
  contactNotes?: ContactNoteModel[]
  conversation?: ConversationResource | null
}

export type ContactCollection = {
  data: ContactResource[]
  pageCount: number
}

export type ContactEditableField = {
  key: string
  icon: LucideIcon
  label: string
  value: string | null | undefined
  customFieldType: CustomFieldType
}
