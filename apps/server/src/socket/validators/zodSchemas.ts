import { z } from 'zod'

// Call schemas
export const callOfferSchema = z.object({
  recipientId: z.string({
    required_error: "Recipient ID is required",
    invalid_type_error: "Recipient ID must be a string"
  }).min(1, "Recipient ID is required"),
  sdp: z.object({
    type: z.string(),
    sdp: z.string()
  }, {
    required_error: "SDP is required",
    invalid_type_error: "SDP must be an object"
  }),
  callType: z.enum(["audio", "video"], {
    required_error: "Call type is required",
    invalid_type_error: "Call type must be either 'audio' or 'video'"
  })
})

export const callAnswerSchema = z.object({
  callId: z.string().min(1, "Call ID is required"),
  accepted: z.boolean({
    required_error: "Accepted is required",
    invalid_type_error: "Accepted must be a boolean"
  }),
  sdp: z.object({
    type: z.string(),
    sdp: z.string()
  }).optional()
}).refine((data) => {
  // If accepted is true, sdp is required
  if (data.accepted === true && !data.sdp) {
    return false
  }
  return true
}, {
  message: "SDP is required when call is accepted",
  path: ["sdp"]
})

export const callIceCandidateSchema = z.object({
  callId: z.string().min(1, "Call ID is required"),
  candidate: z.object({
    candidate: z.string(),
    sdpMLineIndex: z.number().nullable(),
    sdpMid: z.string().nullable(),
    usernameFragment: z.string().optional()
  }),
  userId: z.string().optional()
})

export const callEndSchema = z.object({
  callId: z.string().min(1, "Call ID is required")
})

// Group schemas
export const createGroupSchema = z.object({
  name: z.string({
    required_error: "Name is required",
    invalid_type_error: "Name must be a string"
  }).min(1, "Name is required"),
  description: z.string({
    invalid_type_error: "Description must be a string"
  }).optional().nullable(),
  members: z.array(z.string({
    invalid_type_error: "Each member ID must be a string"
  }), {
    invalid_type_error: "Members must be an array"
  }).optional(),
  isPublic: z.boolean({
    invalid_type_error: "Is public must be a boolean"
  }).default(true)
})

export const updateGroupSchema = z.object({
  groupId: z.string().min(1, "Group ID is required"),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
  settings: z.record(z.any()).optional()
})

export const addMemberSchema = z.object({
  groupId: z.string().min(1, "Group ID is required"),
  memberId: z.string().min(1, "Member ID is required"),
  role: z.enum(["member", "admin"]).default("member").optional()
})

export const updateMemberRoleSchema = z.object({
  groupId: z.string().min(1, "Group ID is required"),
  memberId: z.string().min(1, "Member ID is required"),
  role: z.enum(["admin", "moderator", "member"]),
  updatedBy: z.string().optional()
})

// Message schemas
export const messageEventSchema = z.object({
  conversationId: z.string().min(1, "Conversation ID is required"),
  content: z.string().min(1, "Content is required"),
  contentType: z.enum(["text", "image", "file", "audio", "video"]).default("text"),
  mediaUrl: z.string().url().optional(),
  mediaDetails: z.object({
    filename: z.string().optional(),
    size: z.number().optional(),
    mimeType: z.string().optional()
  }).optional(),
  replyTo: z.string().optional(),
  mentions: z.array(z.string()).optional()
})

export const messageEditSchema = z.object({
  messageId: z.string().min(1, "Message ID is required"),
  content: z.string().min(1, "Content is required")
})

export const messageReactionSchema = z.object({
  messageId: z.string().min(1, "Message ID is required"),
  reactionType: z.string().min(1, "Reaction type is required")
})

// Presence schemas
export const presenceStatusSchema = z.object({
  status: z.enum(["online", "away", "busy", "offline"]),
  customStatus: z.string().optional()
})

// Typing schemas
export const typingStatusSchema = z.object({
  conversationId: z.string().min(1, "Conversation ID is required"),
  isTyping: z.boolean()
})

// Export types
export type CallOfferData = z.infer<typeof callOfferSchema>
export type CallAnswerData = z.infer<typeof callAnswerSchema>
export type CallIceCandidateData = z.infer<typeof callIceCandidateSchema>
export type CallEndData = z.infer<typeof callEndSchema>
export type CreateGroupData = z.infer<typeof createGroupSchema>
export type UpdateGroupData = z.infer<typeof updateGroupSchema>
export type AddMemberData = z.infer<typeof addMemberSchema>
export type UpdateMemberRoleData = z.infer<typeof updateMemberRoleSchema>
export type MessageEventData = z.infer<typeof messageEventSchema>
export type MessageEditData = z.infer<typeof messageEditSchema>
export type MessageReactionData = z.infer<typeof messageReactionSchema>
export type PresenceStatusData = z.infer<typeof presenceStatusSchema>
export type TypingStatusData = z.infer<typeof typingStatusSchema>
