import { customFieldValueChanged } from "./custom-field-value-changed"
import { dateTimeBasedTrigger } from "./date-time-based-trigger"
import {
  archived,
  contactReferredANewContact,
  contactReferredExistingContact,
  contactUnsubscribedFormBroadcast,
  conversationAssigned,
  conversationTransferredToBot,
  conversationTransferredToHuman,
  conversationUnassigned,
  followUp,
  instagramCommentCreated,
  newContact,
  subscribedToSequence,
  unsubscribedFromSequence,
} from "./simple-conditions"
import { tagApplied } from "./tag-applied"
import { tagRemoved } from "./tag-removed"

export const allConditions = {
  tagApplied,
  tagRemoved,
  customFieldValueChanged,
  dateTimeBasedTrigger,
  conversationTransferredToHuman,
  conversationTransferredToBot,
  newContact,
  contactUnsubscribedFormBroadcast,
  archived,
  followUp,
  conversationAssigned,
  conversationUnassigned,
  instagramCommentCreated,
  subscribedToSequence,
  unsubscribedFromSequence,
  contactReferredANewContact,
  contactReferredExistingContact,
}
