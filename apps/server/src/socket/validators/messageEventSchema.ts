import { z } from 'zod';

// Message content types enum
export const MessageContentType = z.enum(['text', 'image', 'video', 'file', 'audio']);

// Message event schema for sending messages
export const messageEventSchema = z.object({
  content: z.string()
    .min(1, 'Message content is required')
    .max(10000, 'Message content too long'),
  
  roomId: z.string()
    .uuid('Invalid room ID format'),
  
  type: MessageContentType.default('text'),
  
  metadata: z.object({
    timestamp: z.number()
      .int()
      .positive('Invalid timestamp'),
    
    userId: z.string()
      .uuid('Invalid user ID format'),
    
    username: z.string()
      .min(1, 'Username is required')
      .max(50, 'Username too long'),
    
    replyTo: z.string()
      .uuid('Invalid reply message ID format')
      .optional(),
    
    edited: z.boolean().default(false),
    
    reactions: z.array(z.string()).default([]),
    
    attachments: z.array(z.object({
      id: z.string().uuid(),
      filename: z.string(),
      mimetype: z.string(),
      size: z.number().positive(),
      url: z.string().url()
    })).default([])
  })
});

// Join room event schema
export const joinRoomSchema = z.object({
  roomId: z.string()
    .uuid('Invalid room ID format'),
  
  userId: z.string()
    .uuid('Invalid user ID format')
});

// Leave room event schema
export const leaveRoomSchema = z.object({
  roomId: z.string()
    .uuid('Invalid room ID format')
});

// Message read event schema
export const messageReadSchema = z.object({
  messageId: z.string()
    .uuid('Invalid message ID format'),
  
  roomId: z.string()
    .uuid('Invalid room ID format'),
  
  userId: z.string()
    .uuid('Invalid user ID format')
});

// Message delivery event schema
export const messageDeliverySchema = z.object({
  messageId: z.string()
    .uuid('Invalid message ID format'),
  
  roomId: z.string()
    .uuid('Invalid room ID format'),
  
  userId: z.string()
    .uuid('Invalid user ID format'),
  
  deliveredAt: z.number()
    .int()
    .positive('Invalid delivery timestamp')
});

// Message history request schema
export const messageHistorySchema = z.object({
  roomId: z.string()
    .uuid('Invalid room ID format'),
  
  limit: z.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(50),
  
  offset: z.number()
    .int()
    .min(0, 'Offset must be non-negative')
    .default(0),
  
  before: z.string()
    .uuid('Invalid message ID format')
    .optional(),
  
  after: z.string()
    .uuid('Invalid message ID format')
    .optional()
});

// Export TypeScript types
export type MessageEvent = z.infer<typeof messageEventSchema>;
export type JoinRoomEvent = z.infer<typeof joinRoomSchema>;
export type LeaveRoomEvent = z.infer<typeof leaveRoomSchema>;
export type MessageReadEvent = z.infer<typeof messageReadSchema>;
export type MessageDeliveryEvent = z.infer<typeof messageDeliverySchema>;
export type MessageHistoryEvent = z.infer<typeof messageHistorySchema>;
export type MessageContentTypeEnum = z.infer<typeof MessageContentType>;

// Validation helper functions
export const validateMessageEvent = (data: unknown): MessageEvent => {
  return messageEventSchema.parse(data);
};

export const validateJoinRoom = (data: unknown): JoinRoomEvent => {
  return joinRoomSchema.parse(data);
};

export const validateLeaveRoom = (data: unknown): LeaveRoomEvent => {
  return leaveRoomSchema.parse(data);
};

export const validateMessageRead = (data: unknown): MessageReadEvent => {
  return messageReadSchema.parse(data);
};

export const validateMessageDelivery = (data: unknown): MessageDeliveryEvent => {
  return messageDeliverySchema.parse(data);
};

export const validateMessageHistory = (data: unknown): MessageHistoryEvent => {
  return messageHistorySchema.parse(data);
};

// Safe validation functions that return results instead of throwing
export const safeValidateMessageEvent = (data: unknown) => {
  return messageEventSchema.safeParse(data);
};

export const safeValidateJoinRoom = (data: unknown) => {
  return joinRoomSchema.safeParse(data);
};

export const safeValidateLeaveRoom = (data: unknown) => {
  return leaveRoomSchema.safeParse(data);
};

export const safeValidateMessageRead = (data: unknown) => {
  return messageReadSchema.safeParse(data);
};

export const safeValidateMessageDelivery = (data: unknown) => {
  return messageDeliverySchema.safeParse(data);
};

export const safeValidateMessageHistory = (data: unknown) => {
  return messageHistorySchema.safeParse(data);
};

// Default export for backward compatibility
export default {
  messageEventSchema,
  joinRoomSchema,
  leaveRoomSchema,
  messageReadSchema,
  messageDeliverySchema,
  messageHistorySchema,
  validateMessageEvent,
  validateJoinRoom,
  validateLeaveRoom,
  validateMessageRead,
  validateMessageDelivery,
  validateMessageHistory,
  safeValidateMessageEvent,
  safeValidateJoinRoom,
  safeValidateLeaveRoom,
  safeValidateMessageRead,
  safeValidateMessageDelivery,
  safeValidateMessageHistory,
};
