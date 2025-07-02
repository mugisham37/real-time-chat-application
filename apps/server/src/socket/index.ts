// Main socket exports
export { initializeSocketIO, getSocketIOHealth, broadcastToAll, broadcastToUsers, getConnectedUsersCount, getUserSockets, disconnectUser } from "./initializeSocketIO"
export { setupSocketIO } from "./setupSocketIO"

// Handler exports
export { setupMessageHandlers } from "./handlers/messageHandlers"
export { setupPresenceHandlers } from "./handlers/presenceHandlers"
export { setupTypingHandlers } from "./handlers/typingHandlers"
export { setupGroupHandlers } from "./handlers/groupHandlers"
export { setupNotificationHandlers } from "./handlers/notificationHandlers"
export { setupCallHandlers } from "./handlers/callHandlers"

// Middleware exports
export { socketRateLimiter, advancedSocketRateLimiter, burstProtectionMiddleware, ipRateLimiter } from "./middleware/socketRateLimiter"

// Utility exports
export { validateSocketEvent } from "./utils/validateSocketEvent"

// Validator exports
export { messageEventSchema } from "./validators/messageEventSchema"
export { messageEditSchema } from "./validators/messageEditSchema"
export { messageReactionSchema } from "./validators/messageReactionSchema"
export { presenceStatusSchema } from "./validators/presenceStatusSchema"
export { typingStatusSchema } from "./validators/typingStatusSchema"
export { callOfferSchema } from "./validators/callOfferSchema"
export { callAnswerSchema } from "./validators/callAnswerSchema"
export { callIceCandidateSchema } from "./validators/callIceCandidateSchema"
export { createGroupSchema } from "./validators/createGroupSchema"
export { updateGroupSchema } from "./validators/updateGroupSchema"
export { addMemberSchema } from "./validators/addMemberSchema"
export { updateMemberRoleSchema } from "./validators/updateMemberRoleSchema"

// Socket event types and interfaces
export interface SocketEventResponse {
  success: boolean
  message?: string
  data?: any
  errors?: Array<{ message: string; path?: any }>
}

export interface SocketUser {
  _id: string
  username: string
  firstName?: string
  lastName?: string
  avatar?: string
  email?: string
}

export interface SocketData {
  user?: SocketUser
  sessionId?: string
  deviceId?: string
  userAgent?: string
  ipAddress?: string
}

// Socket event names constants
export const SOCKET_EVENTS = {
  // Connection events
  CONNECTION: "connection",
  DISCONNECT: "disconnect",
  RECONNECT: "reconnect",
  RECONNECT_ATTEMPT: "reconnect_attempt",
  RECONNECT_ERROR: "reconnect_error",
  RECONNECT_FAILED: "reconnect_failed",
  
  // Message events
  MESSAGE_SEND: "message:send",
  MESSAGE_RECEIVED: "message:received",
  MESSAGE_READ: "message:read",
  MESSAGE_EDIT: "message:edit",
  MESSAGE_DELETE: "message:delete",
  MESSAGE_REACT: "message:react",
  MESSAGE_HISTORY: "message:history",
  MESSAGE_DELIVERED: "message:delivered",
  MESSAGE_UPDATED: "message:updated",
  MESSAGE_DELETED: "message:deleted",
  MESSAGE_REACTION_UPDATED: "message:reaction_updated",
  MESSAGE_READ_STATUS: "message:read_status",
  MESSAGE_DELIVERY_STATUS: "message:delivery_status",
  
  // Presence events
  PRESENCE_UPDATE: "presence:update",
  PRESENCE_ONLINE: "presence:online",
  PRESENCE_OFFLINE: "presence:offline",
  PRESENCE_UPDATED: "presence:updated",
  PRESENCE_GET: "presence:get",
  PRESENCE_SUBSCRIBE: "presence:subscribe",
  PRESENCE_UNSUBSCRIBE: "presence:unsubscribe",
  PRESENCE_ONLINE_COUNT: "presence:online_count",
  PRESENCE_ONLINE_USERS: "presence:online_users",
  
  // Typing events
  TYPING_STATUS: "typing:status",
  TYPING_UPDATED: "typing:updated",
  TYPING_GET: "typing:get",
  TYPING_CLEAR: "typing:clear",
  
  // Group events
  GROUP_CREATE: "group:create",
  GROUP_JOIN: "group:join",
  GROUP_LEAVE: "group:leave",
  GROUP_UPDATE: "group:update",
  GROUP_DELETE: "group:delete",
  GROUP_ADD_MEMBER: "group:add_member",
  GROUP_REMOVE_MEMBER: "group:remove_member",
  GROUP_UPDATE_MEMBER_ROLE: "group:update_member_role",
  GROUP_ADDED: "group:added",
  GROUP_REMOVED: "group:removed",
  GROUP_UPDATED: "group:updated",
  GROUP_DELETED: "group:deleted",
  GROUP_MEMBER_JOINED: "group:member_joined",
  GROUP_MEMBER_LEFT: "group:member_left",
  GROUP_MEMBER_REMOVED: "group:member_removed",
  GROUP_MEMBER_ROLE_UPDATED: "group:member_role_updated",
  
  // Call events
  CALL_OFFER: "call:offer",
  CALL_ANSWER: "call:answer",
  CALL_ICE_CANDIDATE: "call:ice_candidate",
  CALL_END: "call:end",
  CALL_INCOMING: "call:incoming",
  CALL_ANSWERED: "call:answered",
  CALL_ENDED: "call:ended",
  
  // Notification events
  NOTIFICATION_UNREAD_COUNT: "notification:unread_count",
  NOTIFICATION_MARK_READ: "notification:mark_read",
  NOTIFICATION_MARK_ALL_READ: "notification:mark_all_read",
  NOTIFICATION_LIST: "notification:list",
  NOTIFICATION_DELETE: "notification:delete",
  NOTIFICATION_CLEAR_ALL: "notification:clear_all",
  NOTIFICATION_UPDATE_PREFERENCES: "notification:update_preferences",
  NOTIFICATION_GET_PREFERENCES: "notification:get_preferences",
  
  // System events
  HEARTBEAT: "heartbeat",
  HEARTBEAT_RESPONSE: "heartbeat_response",
  ERROR: "error",
} as const

// Socket room naming conventions
export const SOCKET_ROOMS = {
  USER: (userId: string) => `user:${userId}`,
  GROUP: (groupId: string) => `group:${groupId}`,
  CONVERSATION: (conversationId: string) => `conversation:${conversationId}`,
  CALL: (callId: string) => `call:${callId}`,
} as const

// Rate limiting constants
export const RATE_LIMITS = {
  DEFAULT: {
    WINDOW: 60 * 1000, // 1 minute
    MAX_REQUESTS: 100,
    BLOCK_DURATION: 5 * 60 * 1000, // 5 minutes
  },
  BURST: {
    MAX_REQUESTS: 15,
    WINDOW: 2 * 1000, // 2 seconds
  },
  IP: {
    MAX_CONNECTIONS: 100,
    WINDOW: 60 * 1000, // 1 minute
  },
} as const

// Socket configuration constants
export const SOCKET_CONFIG = {
  PING_TIMEOUT: 20000, // 20 seconds
  PING_INTERVAL: 25000, // 25 seconds
  CONNECT_TIMEOUT: 10000, // 10 seconds
  MAX_HTTP_BUFFER_SIZE: 5e6, // 5MB
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  CONNECTION_RECOVERY_DURATION: 2 * 60 * 1000, // 2 minutes
  COMPRESSION_THRESHOLD: 2048, // 2KB
} as const

// Error codes for socket events
export const SOCKET_ERROR_CODES = {
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  CONNECTION_ERROR: "CONNECTION_ERROR",
  TIMEOUT: "TIMEOUT",
} as const

// Socket status constants
export const SOCKET_STATUS = {
  ONLINE: "online",
  OFFLINE: "offline",
  AWAY: "away",
  BUSY: "busy",
} as const

// Content types for messages
export const MESSAGE_CONTENT_TYPES = {
  TEXT: "text",
  IMAGE: "image",
  VIDEO: "video",
  FILE: "file",
  AUDIO: "audio",
} as const

// Call types
export const CALL_TYPES = {
  AUDIO: "audio",
  VIDEO: "video",
} as const

// Group member roles
export const GROUP_ROLES = {
  ADMIN: "admin",
  MODERATOR: "moderator",
  MEMBER: "member",
} as const
