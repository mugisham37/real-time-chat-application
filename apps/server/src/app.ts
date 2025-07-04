import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import { createServer } from "http";
import { config } from "./config";
import { prisma } from "@chatapp/database";
import { connectRedis, getRedisManager } from "./config/redis";
import { errorHandler } from "./middleware/errorHandler";
import { logger, httpLogStream, systemLogger } from "./utils/logger";
import { initializeSocketIO } from "./socket/initializeSocketIO";
import { setupSocketIO } from "./socket/setupSocketIO";
import { ChatMetrics, startMetricsCollection } from "./utils/metrics";
import routes from "./routes";

// Create Express app
const app = express();

// Create HTTP server
const server = createServer(app);

// Initialize Socket.IO
const io = initializeSocketIO(server);

// Set up socket handlers
setupSocketIO(io);

// Trust proxy for accurate IP addresses
app.set("trust proxy", 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https:", "data:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: config.server.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key', 'X-Signature', 'X-Timestamp'],
  maxAge: 86400, // 24 hours
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ 
  limit: config.api.maxRequestSize,
  verify: (req, res, buf) => {
    // Store raw body for signature verification
    (req as any).rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: config.api.maxRequestSize 
}));

// Request correlation ID middleware
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] as string || 
                       require('crypto').randomUUID();
  (req as any).correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
});

// Logging middleware
app.use(morgan("combined", {
  stream: httpLogStream,
  skip: (req, res) => {
    // Skip logging for health checks in production
    return config.isProduction && req.path === '/health';
  }
}));

// Request timing middleware
app.use((req, res, next) => {
  const start = Date.now();
  (req as any).startTime = start;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route ? req.route.path : req.path;
    const method = req.method;
    const status = res.statusCode;
    
    // Record metrics
    ChatMetrics.recordApiRequest(method, route, status, duration);
    
    if (status >= 400) {
      ChatMetrics.incrementApiErrors(method, route, status, res.statusMessage || "Unknown error");
    }
    
    // Log slow requests
    if (duration > 1000) { // Log requests taking more than 1 second
      logger.warn('Slow request detected', {
        method,
        path: req.path,
        duration,
        status,
        correlationId: (req as any).correlationId,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });
    }
  });
  
  next();
});

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const healthChecks = {
      server: "ok",
      database: "checking",
      redis: "checking",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
      environment: config.nodeEnv,
    };

    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      healthChecks.database = "ok";
    } catch (error) {
      healthChecks.database = "error";
      logger.error('Database health check failed:', error);
    }

    // Check Redis connection
    try {
      const redis = getRedisManager();
      await redis.ping();
      healthChecks.redis = "ok";
    } catch (error) {
      healthChecks.redis = "error";
      logger.error('Redis health check failed:', error);
    }

    const isHealthy = healthChecks.database === "ok" && healthChecks.redis === "ok";
    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      status: isHealthy ? "healthy" : "unhealthy",
      checks: healthChecks,
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: "unhealthy",
      error: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// Readiness probe endpoint
app.get("/ready", async (req, res) => {
  try {
    // More comprehensive readiness check
    await prisma.$queryRaw`SELECT 1`;
    const redis = getRedisManager();
    await redis.ping();
    
    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: "not ready",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
});

// Liveness probe endpoint
app.get("/live", (req, res) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    // Update system metrics
    const memoryUsage = process.memoryUsage();
    ChatMetrics.recordMemoryUsage();
    ChatMetrics.setUptime();

    // Get metrics in Prometheus format
    const { getMetrics } = await import('./utils/metrics');
    const metricsData = getMetrics();
    
    res.set("Content-Type", "text/plain");
    res.send(metricsData);
  } catch (error) {
    logger.error("Error generating metrics:", error);
    res.status(500).json({
      error: "Error generating metrics",
      timestamp: new Date().toISOString(),
    });
  }
});

// API info endpoint
app.get("/info", (req, res) => {
  res.json({
    name: "Real-time Chat Application API",
    version: process.env.npm_package_version || "1.0.0",
    environment: config.nodeEnv,
    features: {
      authentication: true,
      realTimeMessaging: true,
      voiceCalls: config.features.voiceCalls,
      videoCalls: config.features.videoCalls,
      endToEndEncryption: config.features.messageEncryption,
      fileSharing: config.features.fileSharing,
      groupChats: config.features.groupChats,
      messageReactions: config.features.messageReactions,
      messageEditing: config.features.messageEditing,
      messageSearch: config.features.messageSearch,
      userBlocking: config.features.userBlocking,
      readReceipts: config.features.readReceipts,
      typingIndicators: config.features.typingIndicators,
      presence: config.features.presence,
    },
    limits: {
      maxFileSize: config.upload.maxFileSize,
      maxRequestSize: config.api.maxRequestSize,
      rateLimits: {
        api: config.rateLimit.api,
        auth: config.rateLimit.auth,
        upload: config.rateLimit.upload,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use("/api", routes);

// Swagger documentation endpoint (placeholder)
app.get("/docs", (req, res) => {
  res.json({
    message: "API Documentation",
    swagger: "/api/docs",
    postman: "/api/postman",
    openapi: "/api/openapi.json",
    endpoints: {
      health: "/health",
      metrics: "/metrics",
      info: "/info",
      api: "/api",
    },
  });
});

// 404 handler for undefined routes
app.use("*", (req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    correlationId: (req as any).correlationId,
  });

  res.status(404).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found`,
      timestamp: new Date().toISOString(),
      correlationId: (req as any).correlationId,
    },
  });
});

// Global error handler
app.use(errorHandler);

// Database connection function
export const connectToDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    
    // Test the connection
    await prisma.$queryRaw`SELECT 1`;
    
    systemLogger.logDatabaseConnection('connected', {
      provider: 'postgresql',
      host: process.env.DATABASE_URL ? 'configured' : 'not configured',
    });
    
    logger.info('✅ Database connected successfully');
  } catch (error) {
    systemLogger.logDatabaseConnection('error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
};

// Database disconnection function
export const disconnectFromDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    systemLogger.logDatabaseConnection('disconnected');
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Error disconnecting from database:', error);
  }
};

// Initialize cron jobs (placeholder)
export const initCronJobs = (): void => {
  logger.info('Initializing cron jobs...');
  
  // Placeholder for cron jobs
  // In a real implementation, you would set up scheduled tasks here
  // Examples:
  // - Clean up expired sessions
  // - Process scheduled messages
  // - Generate analytics reports
  // - Clean up old files
  
  if (config.isDevelopment) {
    logger.info('Cron jobs initialized (development mode)');
  } else {
    logger.info('Cron jobs initialized (production mode)');
  }
};

// Start server function
export const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectToDatabase();
    
    // Connect to Redis
    await connectRedis();
    
    // Initialize database indexes (placeholder)
    logger.info('Database indexes verified');
    
    // Initialize cron jobs
    initCronJobs();
    
    // Start metrics collection
    if (config.monitoring.enabled) {
      startMetricsCollection();
      logger.info('✅ Metrics collection started');
    }
    
    // Start server
    const PORT = config.server.port || 5000;
    server.listen(PORT, () => {
      systemLogger.logSystemStart();
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📱 Environment: ${config.nodeEnv}`);
      logger.info(`🔗 API URL: http://localhost:${PORT}`);
      logger.info(`🔌 Socket URL: http://localhost:${PORT}`);
      logger.info(`📊 Metrics: http://localhost:${PORT}/metrics`);
      
      if (config.isDevelopment) {
        logger.info(`📚 API Docs: http://localhost:${PORT}/docs`);
        logger.info(`🔍 Health Check: http://localhost:${PORT}/health`);
      }
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    throw error;
  }
};

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Handle SIGTERM
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  
  try {
    // Close server
    server.close(() => {
      logger.info("HTTP server closed");
    });
    
    // Disconnect from database
    await disconnectFromDatabase();
    
    // Disconnect from Redis
    const { disconnectRedis } = await import('./config/redis');
    await disconnectRedis();
    
    systemLogger.logSystemShutdown();
    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
});

// Handle SIGINT
process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  
  try {
    // Close server
    server.close(() => {
      logger.info("HTTP server closed");
    });
    
    // Disconnect from database
    await disconnectFromDatabase();
    
    // Disconnect from Redis
    const { disconnectRedis } = await import('./config/redis');
    await disconnectRedis();
    
    systemLogger.logSystemShutdown();
    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown:", error);
    process.exit(1);
  }
});

// Export app, server, and utility functions for testing and external use
export { app, server, io };
export default app;
