// API Constants
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    PROFILE: '/auth/profile',
    VERIFY_EMAIL: '/auth/verify-email',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
  },
  USERS: {
    BASE: '/users',
    PROFILE: '/users/profile',
    SEARCH: '/users/search',
    ONLINE: '/users/online',
    UPDATE_STATUS: '/users/status',
  },
  CONVERSATIONS: {
    BASE: '/conversations',
    MESSAGES: (id: string) => `/conversations/${id}/messages`,
    PARTICIPANTS: (id: string) => `/conversations/${id}/participants`,
    MARK_READ: (id: string) => `/conversations/${id}/read`,
  },
  MESSAGES: {
    BASE: '/messages',
    REACTIONS: (id: string) => `/messages/${id}/reactions`,
    EDIT: (id: string) => `/messages/${id}`,
    DELETE: (id: string) => `/messages/${id}`,
  },
  GROUPS: {
    BASE: '/groups',
    MEMBERS: (id: string) => `/groups/${id}/members`,
    INVITATIONS: (id: string) => `/groups/${id}/invitations`,
    JOIN_REQUESTS: (id: string) => `/groups/${id}/join-requests`,
  },
  NOTIFICATIONS: {
    BASE: '/notifications',
    MARK_READ: (id: string) => `/notifications/${id}/read`,
    MARK_ALL_READ: '/notifications/read-all',
  },
  UPLOADS: {
    BASE: '/uploads',
    IMAGES: '/uploads/images',
    FILES: '/uploads/files',
  },
  SEARCH: {
    BASE: '/search',
    MESSAGES: '/search/messages',
    USERS: '/search/users',
    GROUPS: '/search/groups',
  },
} as const;

// Socket Events
export const SOCKET_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  
  // Authentication
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  UNAUTHORIZED: 'unauthorized',
  
  // Messages
  MESSAGE_SEND: 'message:send',
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_REACT: 'message:react',
  MESSAGE_REACTION: 'message:reaction',
  MESSAGE_READ: 'message:read',
  
  // Typing
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  
  // Presence
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  USER_STATUS: 'user:status',
  PRESENCE_UPDATE: 'presence:update',
  
  // Conversations
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  CONVERSATION_UPDATED: 'conversation:updated',
  PARTICIPANT_JOINED: 'conversation:participant:joined',
  PARTICIPANT_LEFT: 'conversation:participant:left',
  
  // Groups
  GROUP_CREATE: 'group:create',
  GROUP_CREATED: 'group:created',
  GROUP_UPDATE: 'group:update',
  GROUP_UPDATED: 'group:updated',
  GROUP_ADD_MEMBER: 'group:add-member',
  GROUP_MEMBER_ADDED: 'group:member:added',
  GROUP_REMOVE_MEMBER: 'group:remove-member',
  GROUP_MEMBER_REMOVED: 'group:member:removed',
  GROUP_UPDATE_MEMBER_ROLE: 'group:update-member-role',
  GROUP_MEMBER_ROLE_UPDATED: 'group:member:role:updated',
  
  // Notifications
  NOTIFICATION_NEW: 'notification:new',
  
  // Calls
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE_CANDIDATE: 'call:ice-candidate',
  CALL_END: 'call:end',
} as const;

// Validation Constants
export const VALIDATION = {
  USER: {
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 30,
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_MAX_LENGTH: 128,
    FIRST_NAME_MAX_LENGTH: 50,
    LAST_NAME_MAX_LENGTH: 50,
    BIO_MAX_LENGTH: 500,
  },
  MESSAGE: {
    CONTENT_MAX_LENGTH: 4000,
    EDIT_TIME_LIMIT: 15 * 60 * 1000, // 15 minutes in milliseconds
  },
  GROUP: {
    NAME_MIN_LENGTH: 1,
    NAME_MAX_LENGTH: 100,
    DESCRIPTION_MAX_LENGTH: 500,
    MAX_MEMBERS_DEFAULT: 100,
    MAX_MEMBERS_LIMIT: 1000,
  },
  FILE: {
    MAX_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    ALLOWED_FILE_TYPES: [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
} as const;

// Rate Limiting
export const RATE_LIMITS = {
  AUTH: {
    LOGIN: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 attempts per 15 minutes
    REGISTER: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 attempts per hour
    FORGOT_PASSWORD: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 attempts per hour
  },
  API: {
    GENERAL: { windowMs: 15 * 60 * 1000, max: 100 }, // 100 requests per 15 minutes
    MESSAGES: { windowMs: 60 * 1000, max: 30 }, // 30 messages per minute
    UPLOADS: { windowMs: 60 * 60 * 1000, max: 10 }, // 10 uploads per hour
  },
  SOCKET: {
    MESSAGES: { windowMs: 60 * 1000, max: 30 }, // 30 messages per minute
    TYPING: { windowMs: 10 * 1000, max: 10 }, // 10 typing events per 10 seconds
  },
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_PAGE: 1,
} as const;

// Cache TTL (Time To Live) in seconds
export const CACHE_TTL = {
  USER_PROFILE: 5 * 60, // 5 minutes
  CONVERSATIONS: 2 * 60, // 2 minutes
  MESSAGES: 10 * 60, // 10 minutes
  ONLINE_USERS: 30, // 30 seconds
  SEARCH_RESULTS: 5 * 60, // 5 minutes
} as const;

// Error Codes
export const ERROR_CODES = {
  // Authentication
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Resources
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  
  // Permissions
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  NOT_CONVERSATION_PARTICIPANT: 'NOT_CONVERSATION_PARTICIPANT',
  NOT_GROUP_MEMBER: 'NOT_GROUP_MEMBER',
  
  // Conflicts
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  USERNAME_ALREADY_EXISTS: 'USERNAME_ALREADY_EXISTS',
  ALREADY_GROUP_MEMBER: 'ALREADY_GROUP_MEMBER',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  
  // File Upload
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  
  // Server
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  USER_CREATED: 'User created successfully',
  USER_UPDATED: 'User updated successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  MESSAGE_SENT: 'Message sent successfully',
  MESSAGE_UPDATED: 'Message updated successfully',
  MESSAGE_DELETED: 'Message deleted successfully',
  GROUP_CREATED: 'Group created successfully',
  GROUP_UPDATED: 'Group updated successfully',
  MEMBER_ADDED: 'Member added successfully',
  MEMBER_REMOVED: 'Member removed successfully',
  INVITATION_SENT: 'Invitation sent successfully',
  FILE_UPLOADED: 'File uploaded successfully',
} as const;

// WebRTC Configuration
export const WEBRTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
} as const;

// Emoji Reactions
export const EMOJI_REACTIONS = [
  '👍', '👎', '❤️', '😂', '😮', '😢', '😡', '👏', '🎉', '🔥'
] as const;

// Message Types
export const MESSAGE_TYPES = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  FILE: 'FILE',
  AUDIO: 'AUDIO',
  VIDEO: 'VIDEO',
  SYSTEM: 'SYSTEM',
} as const;

// Notification Types
export const NOTIFICATION_TYPES = {
  MESSAGE: 'MESSAGE',
  GROUP_INVITATION: 'GROUP_INVITATION',
  GROUP_JOIN_REQUEST: 'GROUP_JOIN_REQUEST',
  MENTION: 'MENTION',
  REACTION: 'REACTION',
  SYSTEM: 'SYSTEM',
} as const;

// User Presence Status
export const PRESENCE_STATUS = {
  ONLINE: 'ONLINE',
  AWAY: 'AWAY',
  BUSY: 'BUSY',
  OFFLINE: 'OFFLINE',
} as const;

// Group Roles
export const GROUP_ROLES = {
  MEMBER: 'MEMBER',
  MODERATOR: 'MODERATOR',
  ADMIN: 'ADMIN',
  OWNER: 'OWNER',
} as const;

// Conversation Types
export const CONVERSATION_TYPES = {
  DIRECT: 'DIRECT',
  GROUP: 'GROUP',
} as const;

// Environment
export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;

// Date Formats
export const DATE_FORMATS = {
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
  DISPLAY: 'MMM DD, YYYY',
  TIME: 'HH:mm',
  FULL: 'MMM DD, YYYY HH:mm',
} as const;

// File Upload Limits
export const FILE_UPLOAD_LIMITS = {
  IMAGE: { maxSize: 5 * 1024 * 1024 }, // 5MB
  DOCUMENT: { maxSize: 10 * 1024 * 1024 }, // 10MB
  AUDIO: { maxSize: 20 * 1024 * 1024 }, // 20MB
  VIDEO: { maxSize: 50 * 1024 * 1024 }, // 50MB
  AVATAR: { maxSize: 2 * 1024 * 1024 }, // 2MB
  GENERAL: { maxSize: 10 * 1024 * 1024 }, // 10MB
} as const;

// Allowed File Types
export const ALLOWED_FILE_TYPES = {
  IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  DOCUMENTS: [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  AUDIO: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac'],
  VIDEO: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'chatapp_auth_token',
  REFRESH_TOKEN: 'chatapp_refresh_token',
  USER_PREFERENCES: 'chatapp_user_preferences',
  THEME: 'chatapp_theme',
  LANGUAGE: 'chatapp_language',
} as const;
