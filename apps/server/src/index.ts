import 'dotenv/config';
import { startServer } from './app';
import { logger, systemLogger } from './utils/logger';
import { disconnectFromDatabase } from './app';
import { disconnectRedis } from './config/redis';
import { config } from './config';

/**
 * Primary Entry Point for Real-time Chat Application
 * 
 * This file serves as the main bootstrap for the entire backend system,
 * handling environment validation, server initialization, and graceful shutdown.
 * It orchestrates the startup sequence and ensures proper error handling
 * throughout the application lifecycle.
 */

// Environment validation
const validateEnvironment = (): void => {
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'SESSION_SECRET',
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logger.error('❌ Missing required environment variables:', {
      missing: missingVars,
      environment: process.env.NODE_ENV,
    });
    
    console.error('\n🚨 CONFIGURATION ERROR 🚨');
    console.error('The following required environment variables are missing:');
    missingVars.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    console.error('Refer to .env.example for the complete list of required variables.\n');
    
    process.exit(1);
  }

  // Validate JWT secrets length
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;

  if (jwtSecret && jwtSecret.length < 32) {
    logger.error('❌ JWT_SECRET must be at least 32 characters long');
    process.exit(1);
  }

  if (jwtRefreshSecret && jwtRefreshSecret.length < 32) {
    logger.error('❌ JWT_REFRESH_SECRET must be at least 32 characters long');
    process.exit(1);
  }

  if (sessionSecret && sessionSecret.length < 32) {
    logger.error('❌ SESSION_SECRET must be at least 32 characters long');
    process.exit(1);
  }

  logger.info('✅ Environment validation passed');
};

// System requirements check
const checkSystemRequirements = (): void => {
  const nodeVersion = process.version;
  const requiredNodeVersion = '18.0.0';
  
  const currentVersion = nodeVersion.slice(1).split('.').map(Number);
  const required = requiredNodeVersion.split('.').map(Number);
  
  let isVersionValid = false;
  for (let i = 0; i < 3; i++) {
    if (currentVersion[i] > required[i]) {
      isVersionValid = true;
      break;
    } else if (currentVersion[i] < required[i]) {
      break;
    }
  }
  
  if (!isVersionValid && currentVersion.join('.') !== required.join('.')) {
    logger.error(`❌ Node.js version ${requiredNodeVersion} or higher is required. Current: ${nodeVersion}`);
    process.exit(1);
  }

  // Check available memory
  const totalMemory = process.memoryUsage();
  const availableMemory = totalMemory.heapTotal;
  const minimumMemory = 512 * 1024 * 1024; // 512MB

  if (availableMemory < minimumMemory) {
    logger.warn('⚠️ Low memory detected. Application may not perform optimally.', {
      available: `${Math.round(availableMemory / 1024 / 1024)}MB`,
      recommended: '512MB+',
    });
  }

  logger.info('✅ System requirements check passed', {
    nodeVersion,
    platform: process.platform,
    arch: process.arch,
    memory: `${Math.round(availableMemory / 1024 / 1024)}MB`,
  });
};

// Display startup banner
const displayStartupBanner = (): void => {
  const banner = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║           🚀 Real-time Chat Application Server 🚀            ║
║                                                              ║
║  Environment: ${config.nodeEnv.padEnd(10)} │ Version: ${(process.env.npm_package_version || '1.0.0').padEnd(10)} ║
║  Platform: ${process.platform.padEnd(13)} │ Node: ${process.version.padEnd(13)} ║
║  Database: PostgreSQL      │ Cache: Redis           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `;
  
  console.log(banner);
};

// Application initialization
const initializeApplication = async (): Promise<void> => {
  try {
    logger.info('🔄 Initializing Real-time Chat Application...');
    
    // Display startup information
    displayStartupBanner();
    
    // Validate environment
    validateEnvironment();
    
    // Check system requirements
    checkSystemRequirements();
    
    // Log configuration summary
    logger.info('📋 Configuration Summary:', {
      environment: config.nodeEnv,
      port: config.server.port,
      database: 'PostgreSQL',
      cache: 'Redis',
      features: {
        encryption: config.features.messageEncryption,
        monitoring: config.monitoring.enabled,
        rateLimiting: true,
        fileUploads: config.features.fileSharing,
        realTimeMessaging: true,
      },
    });
    
    // Start the server
    await startServer();
    
    logger.info('🎉 Application initialized successfully!');
    
  } catch (error) {
    logger.error('❌ Failed to initialize application:', error);
    
    // Log additional context for debugging
    if (error instanceof Error) {
      logger.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: config.isDevelopment ? error.stack : undefined,
      });
    }
    
    // Attempt graceful cleanup
    await gracefulShutdown(1);
  }
};

// Graceful shutdown handler
const gracefulShutdown = async (exitCode: number = 0): Promise<void> => {
  logger.info('🔄 Initiating graceful shutdown...');
  
  try {
    // Set a timeout for forced shutdown
    const shutdownTimeout = setTimeout(() => {
      logger.error('❌ Graceful shutdown timeout reached, forcing exit');
      process.exit(1);
    }, 30000); // 30 seconds timeout
    
    // Disconnect from databases
    logger.info('📦 Disconnecting from databases...');
    
    try {
      await disconnectFromDatabase();
      logger.info('✅ Database disconnected');
    } catch (error) {
      logger.error('❌ Error disconnecting from database:', error);
    }
    
    try {
      await disconnectRedis();
      logger.info('✅ Redis disconnected');
    } catch (error) {
      logger.error('❌ Error disconnecting from Redis:', error);
    }
    
    // Clear the shutdown timeout
    clearTimeout(shutdownTimeout);
    
    systemLogger.logSystemShutdown();
    logger.info('✅ Graceful shutdown completed');
    
    // Small delay to ensure logs are written
    setTimeout(() => {
      process.exit(exitCode);
    }, 100);
    
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Process event handlers
const setupProcessHandlers = (): void => {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('💥 Uncaught Exception:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    
    // In production, we should exit the process
    if (config.isProduction) {
      gracefulShutdown(1);
    }
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('💥 Unhandled Promise Rejection:', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    });
    
    // In production, we should exit the process
    if (config.isProduction) {
      gracefulShutdown(1);
    }
  });
  
  // Handle SIGTERM (graceful shutdown)
  process.on('SIGTERM', () => {
    logger.info('📡 SIGTERM signal received');
    gracefulShutdown(0);
  });
  
  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('📡 SIGINT signal received (Ctrl+C)');
    gracefulShutdown(0);
  });
  
  // Handle SIGUSR2 (nodemon restart)
  process.on('SIGUSR2', () => {
    logger.info('📡 SIGUSR2 signal received (nodemon restart)');
    gracefulShutdown(0);
  });
  
  // Handle process warnings
  process.on('warning', (warning: Error) => {
    logger.warn('⚠️ Process Warning:', {
      name: warning.name,
      message: warning.message,
      stack: config.isDevelopment ? warning.stack : undefined,
    });
  });
  
  // Handle exit event
  process.on('exit', (code: number) => {
    logger.info(`🏁 Process exiting with code: ${code}`);
  });
  
  logger.info('✅ Process event handlers configured');
};

// Performance monitoring
const setupPerformanceMonitoring = (): void => {
  if (!config.monitoring.enabled) {
    return;
  }
  
  // Monitor memory usage
  const memoryMonitorInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    const memoryMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };
    
    // Log if memory usage is high
    if (memoryMB.heapUsed > 500) { // 500MB threshold
      logger.warn('⚠️ High memory usage detected:', memoryMB);
    }
    
    // Log memory stats in development
    if (config.isDevelopment) {
      logger.debug('📊 Memory Usage:', memoryMB);
    }
  }, 60000); // Check every minute
  
  // Monitor event loop lag
  const eventLoopMonitorInterval = setInterval(() => {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
      
      if (lag > 100) { // 100ms threshold
        logger.warn('⚠️ Event loop lag detected:', { lag: `${lag.toFixed(2)}ms` });
      }
    });
  }, 30000); // Check every 30 seconds
  
  // Cleanup intervals on shutdown
  process.on('SIGTERM', () => {
    clearInterval(memoryMonitorInterval);
    clearInterval(eventLoopMonitorInterval);
  });
  
  process.on('SIGINT', () => {
    clearInterval(memoryMonitorInterval);
    clearInterval(eventLoopMonitorInterval);
  });
  
  logger.info('✅ Performance monitoring enabled');
};

// Development helpers
const setupDevelopmentHelpers = (): void => {
  if (!config.isDevelopment) {
    return;
  }
  
  // Log helpful development information
  logger.info('🔧 Development mode enabled');
  logger.info('📝 Helpful endpoints:', {
    health: 'GET /health',
    metrics: 'GET /metrics',
    info: 'GET /info',
    docs: 'GET /docs',
    api: 'GET /api',
  });
  
  // Enable additional debugging
  if (process.env.DEBUG) {
    logger.info('🐛 Debug mode enabled');
  }
  
  // Hot reload notification
  if (process.env.npm_lifecycle_event === 'dev') {
    logger.info('🔥 Hot reload enabled - server will restart on file changes');
  }
};

// Main execution
const main = async (): Promise<void> => {
  try {
    // Setup process handlers first
    setupProcessHandlers();
    
    // Setup performance monitoring
    setupPerformanceMonitoring();
    
    // Setup development helpers
    setupDevelopmentHelpers();
    
    // Initialize the application
    await initializeApplication();
    
  } catch (error) {
    logger.error('💥 Fatal error during startup:', error);
    await gracefulShutdown(1);
  }
};

// Start the application
main().catch(async (error) => {
  console.error('💥 Fatal startup error:', error);
  await gracefulShutdown(1);
});

// Export for testing purposes
export { initializeApplication, gracefulShutdown };
