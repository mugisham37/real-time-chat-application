// Socket.IO event types for client-server communication

export interface ServerToClientEvents {
  'message:new': (data: {
    id: string;
    conversationId: string;
    content: string;
    type: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO';
    senderId: string;
    createdAt: string;
  }) => void;
  
  'typing:start': (data: {
    conversationId: string;
    userId: string;
    username: string;
  }) => void;
  
  'typing:stop': (data: {
    conversationId: string;
    userId: string;
  }) => void;
  
  'user:online': (data: {
    userId: string;
    username: string;
  }) => void;
  
  'user:offline': (data: {
    userId: string;
  }) => void;
  
  'conversation:updated': (data: {
    conversationId: string;
    lastMessage?: string;
    updatedAt: string;
  }) => void;
  
  'error': (data: {
    code: string;
    message: string;
  }) => void;
}

export interface ClientToServerEvents {
  'message:send': (data: {
    conversationId: string;
    content: string;
    type: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO';
    replyToId?: string;
  }) => void;
  
  'typing:start': (conversationId: string) => void;
  'typing:stop': (conversationId: string) => void;
  
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;
  
  'user:status': (status: 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE') => void;
}
