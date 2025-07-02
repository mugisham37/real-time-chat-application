import { z } from 'zod';

// Authentication Schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  firstName: z.string().max(50, 'First name must be at most 50 characters').optional(),
  lastName: z.string().max(50, 'Last name must be at most 50 characters').optional(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().max(50, 'First name must be at most 50 characters').optional(),
  lastName: z.string().max(50, 'Last name must be at most 50 characters').optional(),
  bio: z.string().max(500, 'Bio must be at most 500 characters').optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
});

// Message Schemas
export const sendMessageSchema = z.object({
  conversationId: z.string().cuid('Invalid conversation ID'),
  content: z.string().min(1, 'Message content is required').max(4000, 'Message too long'),
  type: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO']).default('TEXT'),
  replyToId: z.string().cuid('Invalid message ID').optional(),
  metadata: z.record(z.any()).optional(),
});

export const editMessageSchema = z.object({
  messageId: z.string().cuid('Invalid message ID'),
  content: z.string().min(1, 'Message content is required').max(4000, 'Message too long'),
});

export const reactToMessageSchema = z.object({
  messageId: z.string().cuid('Invalid message ID'),
  emoji: z.string().min(1, 'Emoji is required').max(10, 'Emoji too long'),
});

export const markMessageReadSchema = z.object({
  conversationId: z.string().cuid('Invalid conversation ID'),
  messageId: z.string().cuid('Invalid message ID').optional(),
});

// Group Schemas
export const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(100, 'Group name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  isPrivate: z.boolean().default(false),
  maxMembers: z.number().min(2, 'Group must have at least 2 members').max(1000, 'Too many members').default(100),
  memberIds: z.array(z.string().cuid('Invalid user ID')).min(1, 'At least one member is required'),
});

export const updateGroupSchema = z.object({
  groupId: z.string().cuid('Invalid group ID'),
  name: z.string().min(1, 'Group name is required').max(100, 'Group name too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
  maxMembers: z.number().min(2, 'Group must have at least 2 members').max(1000, 'Too many members').optional(),
});

export const addGroupMemberSchema = z.object({
  groupId: z.string().cuid('Invalid group ID'),
  userId: z.string().cuid('Invalid user ID'),
});

export const removeGroupMemberSchema = z.object({
  groupId: z.string().cuid('Invalid group ID'),
  userId: z.string().cuid('Invalid user ID'),
});

export const updateMemberRoleSchema = z.object({
  groupId: z.string().cuid('Invalid group ID'),
  userId: z.string().cuid('Invalid user ID'),
  role: z.enum(['MEMBER', 'MODERATOR', 'ADMIN', 'OWNER']),
});

// Search Schemas
export const searchSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(100, 'Search query too long'),
  type: z.array(z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO'])).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

// Pagination Schema
export const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// File Upload Schema
export const fileUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  size: z.number().min(1, 'File size must be greater than 0').max(10 * 1024 * 1024, 'File too large'),
});

// Notification Schema
export const markNotificationReadSchema = z.object({
  notificationId: z.string().cuid('Invalid notification ID'),
});

// Socket Event Schemas
export const typingEventSchema = z.object({
  conversationId: z.string().cuid('Invalid conversation ID'),
});

export const presenceUpdateSchema = z.object({
  status: z.enum(['ONLINE', 'AWAY', 'BUSY', 'OFFLINE']),
});

export const joinConversationSchema = z.object({
  conversationId: z.string().cuid('Invalid conversation ID'),
});

// Call Schemas
export const callOfferSchema = z.object({
  conversationId: z.string().cuid('Invalid conversation ID'),
  offer: z.object({
    type: z.literal('offer'),
    sdp: z.string(),
  }),
  type: z.enum(['audio', 'video']),
});

export const callAnswerSchema = z.object({
  conversationId: z.string().cuid('Invalid conversation ID'),
  answer: z.object({
    type: z.literal('answer'),
    sdp: z.string(),
  }),
});

export const callIceCandidateSchema = z.object({
  conversationId: z.string().cuid('Invalid conversation ID'),
  candidate: z.object({
    candidate: z.string(),
    sdpMLineIndex: z.number().nullable(),
    sdpMid: z.string().nullable(),
  }),
});

// Validation helper functions
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function validateSchemaAsync<T>(schema: z.ZodSchema<T>, data: unknown): Promise<T> {
  return schema.parseAsync(data);
}

export function isValidSchema<T>(schema: z.ZodSchema<T>, data: unknown): data is T {
  return schema.safeParse(data).success;
}

export function getSchemaErrors<T>(schema: z.ZodSchema<T>, data: unknown): z.ZodError | null {
  const result = schema.safeParse(data);
  return result.success ? null : result.error;
}

// Type exports
export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;
export type UpdateProfileData = z.infer<typeof updateProfileSchema>;
export type SendMessageData = z.infer<typeof sendMessageSchema>;
export type EditMessageData = z.infer<typeof editMessageSchema>;
export type ReactToMessageData = z.infer<typeof reactToMessageSchema>;
export type MarkMessageReadData = z.infer<typeof markMessageReadSchema>;
export type CreateGroupData = z.infer<typeof createGroupSchema>;
export type UpdateGroupData = z.infer<typeof updateGroupSchema>;
export type AddGroupMemberData = z.infer<typeof addGroupMemberSchema>;
export type RemoveGroupMemberData = z.infer<typeof removeGroupMemberSchema>;
export type UpdateMemberRoleData = z.infer<typeof updateMemberRoleSchema>;
export type SearchData = z.infer<typeof searchSchema>;
export type PaginationData = z.infer<typeof paginationSchema>;
export type FileUploadData = z.infer<typeof fileUploadSchema>;
export type TypingEventData = z.infer<typeof typingEventSchema>;
export type PresenceUpdateData = z.infer<typeof presenceUpdateSchema>;
export type CallOfferData = z.infer<typeof callOfferSchema>;
export type CallAnswerData = z.infer<typeof callAnswerSchema>;
export type CallIceCandidateData = z.infer<typeof callIceCandidateSchema>;
