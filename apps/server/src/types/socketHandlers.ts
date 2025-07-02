import type { Socket } from 'socket.io'

// Base socket interface with user data
export interface AuthenticatedSocket extends Socket {
  data: {
    user?: {
      _id: string
      username: string
      firstName: string
      lastName: string
      avatar?: string
      email: string
    }
  }
}

// Call handler types
export interface CallResponseData {
  callId: string
  accepted: boolean
  sdp?: {
    type: string
    sdp: string
  }
}

export interface IceCandidateData {
  callId: string
  candidate: {
    candidate: string
    sdpMLineIndex: number | null
    sdpMid: string | null
    usernameFragment?: string
  }
  userId?: string
}

export interface CallOfferData {
  recipientId: string
  sdp: {
    type: string
    sdp: string
  }
  callType: 'audio' | 'video'
}

export interface CallEndData {
  callId: string
}

// Group handler types
export interface CreateGroupData {
  name: string
  description?: string | null
  members?: string[]
  isPublic?: boolean
}

export interface UpdateGroupData {
  groupId: string
  name?: string
  description?: string | null
  avatar?: string | null
  isPublic?: boolean
  settings?: Record<string, any>
}

export interface AddMemberData {
  groupId: string
  memberId: string
  role?: 'member' | 'admin'
}

export interface RemoveMemberData {
  groupId: string
  memberId: string
}

export interface UpdateMemberRoleData {
  groupId: string
  memberId: string
  role: 'admin' | 'moderator' | 'member'
  updatedBy?: string
}

export interface JoinGroupData {
  groupId: string
}

export interface LeaveGroupData {
  groupId: string
}

export interface DeleteGroupData {
  groupId: string
}

// Message handler types
export interface SendMessageData {
  conversationId: string
  content: string
  contentType?: 'text' | 'image' | 'file' | 'audio' | 'video'
  mediaUrl?: string
  mediaDetails?: {
    filename?: string
    size?: number
    mimeType?: string
  }
  replyTo?: string
  mentions?: string[]
}

export interface MessageReadData {
  messageId: string
}

export interface MessageEditData {
  messageId: string
  content: string
}

export interface MessageDeleteData {
  messageId: string
}

export interface MessageReactionData {
  messageId: string
  reactionType: string
}

export interface MessageHistoryData {
  conversationId: string
  limit?: number
  before?: string
}

export interface MessageDeliveredData {
  messageIds: string[]
}

// Presence handler types
export interface PresenceUpdateData {
  status: 'online' | 'away' | 'busy' | 'offline'
  customStatus?: string
}

export interface PresenceGetData {
  userIds: string[]
}

export interface PresenceSubscribeData {
  userIds: string[]
}

export interface PresenceOnlineCountData {
  limit?: number
}

// Typing handler types
export interface TypingStatusData {
  conversationId: string
  isTyping: boolean
}

export interface TypingGetData {
  conversationId: string
}

export interface TypingClearData {
  conversationId: string
}

// Notification handler types
export interface NotificationMarkReadData {
  notificationId: string
}

export interface NotificationListData {
  limit?: number
  offset?: number
  unreadOnly?: boolean
}

export interface NotificationDeleteData {
  notificationId: string
}

export interface NotificationPreferencesData {
  preferences: {
    messages?: boolean
    mentions?: boolean
    calls?: boolean
    groups?: boolean
    email?: boolean
    push?: boolean
    sound?: boolean
  }
}

// Repository interfaces (for type safety)
export interface GroupMember {
  user: string
  role: 'admin' | 'moderator' | 'member'
  joinedAt: Date
  addedBy?: string
}

export interface Group {
  _id: string
  name: string
  description?: string | null
  avatar?: string | null
  isPublic: boolean
  members: GroupMember[]
  creator: string
  admins: string[]
  createdAt: Date
  updatedAt: Date
  settings?: Record<string, any>
}

export interface Conversation {
  _id: string
  participants: string[]
  type: 'direct' | 'group'
  createdAt: Date
  updatedAt: Date
}

export interface Message {
  _id: string
  conversationId: string
  conversationType: 'Conversation' | 'Group'
  sender: string
  content: string
  contentType: 'text' | 'image' | 'file' | 'audio' | 'video'
  mediaUrl?: string
  mediaDetails?: {
    filename?: string
    size?: number
    mimeType?: string
  }
  replyTo?: string
  mentions?: string[]
  reactions?: Array<{
    user: string
    type: string
    createdAt: Date
  }>
  deliveredTo: Array<{
    user: string
    deliveredAt: Date
  }>
  readBy: Array<{
    user: string
    readAt: Date
  }>
  isEdited: boolean
  editedAt?: Date
  isDeleted: boolean
  deletedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface User {
  _id: string
  username: string
  firstName: string
  lastName: string
  email: string
  avatar?: string
  status: {
    online: boolean
    lastSeen: Date
    customStatus?: string
  }
  createdAt: Date
  updatedAt: Date
}

// Socket callback types
export interface SocketCallback<T = any> {
  (response: {
    success: boolean
    message?: string
    data?: T
    errors?: Array<{
      message: string
      path: string[]
      code: string
    }>
  }): void
}

// Error handling types
export interface SocketError extends Error {
  code?: string
  statusCode?: number
}

export type SafeError = Error | SocketError | unknown
