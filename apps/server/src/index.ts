import 'dotenv/config';
import { app } from './app';
import { createServer } from 'http';
import { initializeSocketIO } from './socket';
import { connectRedis } from './config/redis';
import { logger } from './utils/logger';
import { prisma } from '@chatapp/database';
import { socketService } from './services/socket.service';

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('✅ Database connected successfully');

    // Connect to Redis
    const redisClient = await connectRedis();
    logger.info('✅ Redis connected successfully');

    // Create HTTP server
    const httpServer = createServer(app);

    // Setup Socket.IO
    const io = initializeSocketIO(httpServer);
    
    // Initialize Socket Service
    socketService.initialize(io);
    logger.info('✅ Socket.IO configured successfully');

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📱 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 API URL: http://localhost:${PORT}`);
      logger.info(`🔌 Socket URL: http://localhost:${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });
      await prisma.$disconnect();
      await redisClient.quit();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });
      await prisma.$disconnect();
      await redisClient.quit();
      process.exit(0);
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
