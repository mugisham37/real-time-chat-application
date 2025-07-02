// Socket.IO Event Types
export interface ServerToClientEvents {
  // Message events
  'message:new': (message: MessageEvent) => void;
  'message:updated': (message: MessageEvent) => void;
  'message:deleted': (messageId: string) => void;
  'message:reaction': (reaction: MessageReactionEvent) => void;
  
  // Typing events
  'typing:start': (data: TypingEvent) => void;
  'typing:stop': (data: TypingEvent) => void;
  
  // Presence events
  'user:online': (userId: string) => void;
  'user:offline': (userId: string) => void;
  'user:status': (data: UserStatusEvent) => void;
  
  // Conversation events
  'conversation:updated': (conversation: ConversationEvent) => void;
  'conversation:participant:joined': (data: ParticipantEvent) => void;
  'conversation:participant:left': (data: ParticipantEvent) => void;
  
  // Group events
  'group:created': (group: GroupEvent) => void;
  'group:updated': (group: GroupEvent) => void;
  'group:member:added': (data: GroupMemberEvent) => void;
  'group:member:removed': (data: GroupMemberEvent) => void;
  'group:member:role:updated': (data: GroupMemberRoleEvent) => void;
  
  // Notification events
  'notification:new': (notification: NotificationEvent) => void;
  
  // Call events
  'call:offer': (data: CallOfferEvent) => void;
  'call:answer': (data: CallAnswerEvent) => void;
  'call:ice-candidate': (data: CallIceCandidateEvent) => void;
  'call:end': (data: CallEndEvent) => void;
  
  // System events
  'error': (error: ErrorEvent) => void;
  'disconnect': (reason: string) => void;
}

export interface ClientToServerEvents {
  // Message events
  'message:send': (data: SendMessageData) => void;
  'message:edit': (data: EditMessageData) => void;
  'message:delete': (messageId: string) => void;
  'message:react': (data: ReactToMessageData) => void;
  'message:read': (data: MarkMessageReadData) => void;
  
  // Typing events
  'typing:start': (conversationId: string) => void;
  'typing:stop': (conversationId: string) => void;
  
  // Presence events
  'presence:update': (status: UserPresenceStatus) => void;
  
  // Conversation events
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;
  
  // Group events
  'group:create': (data: CreateGroupData) => void;
  'group:update': (data: UpdateGroupData) => void;
  'group:add-member': (data: AddGroupMemberData) => void;
  'group:remove-member': (data: RemoveGroupMemberData) => void;
  'group:update-member-role': (data: UpdateMemberRoleData) => void;
  
  // Call events
  'call:offer': (data: CallOfferData) => void;
  'call:answer': (data: CallAnswerData) => void;
  'call:ice-candidate': (data: CallIceCandidateData) => void;
  'call:end': (conversationId: string) => void;
}

// Event Data Types
export interface MessageEvent {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  metadata?: Record<string, any>;
  replyToId?: string;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
  reactions?: MessageReactionEvent[];
  attachments?: MessageAttachment[];
}

export interface MessageReactionEvent {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
  };
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  username: string;
}

export interface UserStatusEvent {
  userId: string;
  isOnline: boolean;
  lastSeen: string;
}

export interface ConversationEvent {
  id: string;
  type: ConversationType;
  name?: string;
  avatar?: string;
  participants: ParticipantInfo[];
  lastMessage?: MessageEvent;
  updatedAt: string;
}

export interface ParticipantEvent {
  conversationId: string;
  userId: string;
  user: ParticipantInfo;
}

export interface GroupEvent {
  id: string;
  conversationId: string;
  name: string;
  description?: string;
  avatar?: string;
  isPrivate: boolean;
  maxMembers: number;
  createdById: string;
  members: GroupMemberInfo[];
}

export interface GroupMemberEvent {
  groupId: string;
  userId: string;
  user: ParticipantInfo;
  role: GroupRole;
}

export interface GroupMemberRoleEvent {
  groupId: string;
  userId: string;
  role: GroupRole;
  updatedBy: string;
}

export interface NotificationEvent {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  createdAt: string;
}

export interface CallOfferEvent {
  conversationId: string;
  callerId: string;
  offer: RTCSessionDescriptionInit;
  type: 'audio' | 'video';
}

export interface CallAnswerEvent {
  conversationId: string;
  answer: RTCSessionDescriptionInit;
}

export interface CallIceCandidateEvent {
  conversationId: string;
  candidate: RTCIceCandidateInit;
}

export interface CallEndEvent {
  conversationId: string;
  endedBy: string;
  reason?: string;
}

export interface ErrorEvent {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// Request Data Types
export interface SendMessageData {
  conversationId: string;
  content: string;
  type?: MessageType;
  replyToId?: string;
  metadata?: Record<string, any>;
}

export interface EditMessageData {
  messageId: string;
  content: string;
}

export interface ReactToMessageData {
  messageId: string;
  emoji: string;
}

export interface MarkMessageReadData {
  conversationId: string;
  messageId?: string;
}

export interface CreateGroupData {
  name: string;
  description?: string;
  isPrivate?: boolean;
  maxMembers?: number;
  memberIds: string[];
}

export interface UpdateGroupData {
  groupId: string;
  name?: string;
  description?: string;
  avatar?: string;
  maxMembers?: number;
}

export interface AddGroupMemberData {
  groupId: string;
  userId: string;
}

export interface RemoveGroupMemberData {
  groupId: string;
  userId: string;
}

export interface UpdateMemberRoleData {
  groupId: string;
  userId: string;
  role: GroupRole;
}

export interface CallOfferData {
  conversationId: string;
  offer: RTCSessionDescriptionInit;
  type: 'audio' | 'video';
}

export interface CallAnswerData {
  conversationId: string;
  answer: RTCSessionDescriptionInit;
}

export interface CallIceCandidateData {
  conversationId: string;
  candidate: RTCIceCandidateInit;
}

// Common Types
export interface ParticipantInfo {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen: string;
  role: ParticipantRole;
  joinedAt: string;
}

export interface GroupMemberInfo {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  isOnline: boolean;
  role: GroupRole;
  joinedAt: string;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface SearchQuery extends PaginationQuery {
  q?: string;
  type?: string[];
  dateFrom?: string;
  dateTo?: string;
}

// Authentication Types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  bio?: string;
  isOnline: boolean;
  lastSeen: string;
  createdAt: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  username: string;
  iat: number;
  exp: number;
}

// Enums
export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  FILE = 'FILE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  SYSTEM = 'SYSTEM',
}

export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
}

export enum ParticipantRole {
  MEMBER = 'MEMBER',
  ADMIN = 'ADMIN',
}

export enum GroupRole {
  MEMBER = 'MEMBER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
}

export enum NotificationType {
  MESSAGE = 'MESSAGE',
  GROUP_INVITATION = 'GROUP_INVITATION',
  GROUP_JOIN_REQUEST = 'GROUP_JOIN_REQUEST',
  MENTION = 'MENTION',
  REACTION = 'REACTION',
  SYSTEM = 'SYSTEM',
}

export enum UserPresenceStatus {
  ONLINE = 'ONLINE',
  AWAY = 'AWAY',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

export enum RequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}
