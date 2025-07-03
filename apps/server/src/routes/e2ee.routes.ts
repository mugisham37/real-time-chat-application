import { Router } from 'express';
import { e2eeController } from '../controllers/e2ee.controller';
import {
  authMiddleware,
  adminMiddleware,
  validateIdParam,
  cache,
  rateLimiter
} from '../middleware';

/**
 * End-to-End Encryption Routes
 * Handles encryption key management, session keys, and encryption utilities
 */

const router = Router();

// Key generation and management
router.post('/generate-keys',
  authMiddleware,
  rateLimiter,
  e2eeController.generateKeys
);

router.get('/public-key/:userId',
  authMiddleware,
  validateIdParam,
  cache({ ttl: 3600 }), // 1 hour cache
  e2eeController.getPublicKey
);

router.put('/public-key',
  authMiddleware,
  e2eeController.updatePublicKey
);

// Session key management
router.post('/session-key',
  authMiddleware,
  rateLimiter,
  e2eeController.storeSessionKey
);

router.get('/session-key/:conversationId',
  authMiddleware,
  validateIdParam,
  e2eeController.getSessionKey
);

// Message encryption/decryption
router.post('/encrypt',
  authMiddleware,
  rateLimiter,
  e2eeController.encryptMessage
);

router.post('/decrypt',
  authMiddleware,
  rateLimiter,
  e2eeController.decryptMessage
);

router.post('/check-encrypted',
  authMiddleware,
  e2eeController.checkEncrypted
);

// User encryption status
router.get('/status',
  authMiddleware,
  cache({ ttl: 300 }), // 5 minutes cache
  e2eeController.getEncryptionStatus
);

// Testing and utilities
router.post('/test',
  authMiddleware,
  e2eeController.testEncryption
);

// Admin operations
router.delete('/keys/:userId',
  authMiddleware,
  validateIdParam,
  e2eeController.deleteKeys
);

router.get('/stats',
  adminMiddleware,
  cache({ ttl: 600 }), // 10 minutes cache
  e2eeController.getEncryptionStats
);

router.post('/bulk-operations',
  adminMiddleware,
  e2eeController.bulkKeyOperations
);

export { router as e2eeRoutes };
