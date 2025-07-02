import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger';
import { 
  ServerToClientEvents, 
  ClientToServerEvents 
} from '../types/socket';

export function setupSocketIO(httpServer: HTTPServer, redisClient: any) {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Setup Redis adapter for scaling
  try {
    const pubClient = redisClient;
    const subClient = redisClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('✅ Socket.IO Redis adapter configured');
  } catch (error) {
    logger.warn('⚠️ Failed to setup Redis adapter, running in single instance mode');
  }

  // Connection handling
  io.on('connection', (socket) => {
    logger.info(`🔌 Client connected: ${socket.id}`);

    // Basic event handlers
    socket.on('disconnect', (reason) => {
      logger.info(`🔌 Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    // Placeholder event handlers - will be implemented later
    socket.on('message:send', (data) => {
      logger.info('📨 Message send event received:', data);
      // TODO: Implement message sending logic
    });

    socket.on('typing:start', (conversationId) => {
      logger.info('⌨️ Typing start event received:', conversationId);
      // TODO: Implement typing indicator logic
    });

    socket.on('typing:stop', (conversationId) => {
      logger.info('⌨️ Typing stop event received:', conversationId);
      // TODO: Implement typing indicator logic
    });

    socket.on('conversation:join', (conversationId) => {
      logger.info('🏠 Join conversation event received:', conversationId);
      socket.join(conversationId);
    });

    socket.on('conversation:leave', (conversationId) => {
      logger.info('🚪 Leave conversation event received:', conversationId);
      socket.leave(conversationId);
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error('❌ Socket error:', error);
    });
  });

  // Global error handling
  io.engine.on('connection_error', (err) => {
    logger.error('❌ Socket.IO connection error:', {
      code: err.code,
      message: err.message,
      context: err.context,
    });
  });

  logger.info('✅ Socket.IO server configured successfully');
  return io;
}
