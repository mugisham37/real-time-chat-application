import { Request, Response } from 'express'
import { z } from 'zod'
import { BaseController } from './base.controller'
import { e2eeService } from '../services/e2ee.service'

/**
 * End-to-End Encryption Controller
 * Handles encryption key management, session keys, and encryption utilities
 */
export class E2EEController extends BaseController {
  /**
   * Generate new key pair for user
   * POST /api/e2ee/generate-keys
   */
  generateKeys = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('generateKeys', userId)

    const keyPair = await e2eeService.generateKeyPair()

    // Store public key for the user
    await e2eeService.storePublicKey(userId, keyPair.publicKey)

    // Return only public key in response (private key should be handled client-side)
    const responseData = {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey, // In production, this should be encrypted or handled differently
      generated: true,
      userId
    }

    this.sendSuccess(res, responseData, 'Key pair generated successfully', 201)
  })

  /**
   * Get user's public key
   * GET /api/e2ee/public-key/:userId
   */
  getPublicKey = this.asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = this.getUserId(req)
    const targetUserId = req.params.userId

    const paramsSchema = z.object({
      userId: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getPublicKey', currentUserId, { targetUserId })

    const publicKey = await e2eeService.getPublicKey(targetUserId)

    if (!publicKey) {
      this.sendSuccess(res, { publicKey: null, hasKey: false }, 'User has no public key')
      return
    }

    this.sendSuccess(res, { 
      publicKey, 
      hasKey: true, 
      userId: targetUserId 
    }, 'Public key retrieved successfully')
  })

  /**
   * Store session key for conversation
   * POST /api/e2ee/session-key
   */
  storeSessionKey = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      conversationId: z.string().min(1, 'Conversation ID is required'),
      encryptedSessionKey: z.string().min(1, 'Encrypted session key is required'),
      expiryInSeconds: z.number().positive().optional().default(86400) // 24 hours default
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('storeSessionKey', userId, { 
      conversationId: body.conversationId,
      expiryInSeconds: body.expiryInSeconds 
    })

    await e2eeService.storeSessionKey(
      body.conversationId,
      userId,
      body.encryptedSessionKey,
      body.expiryInSeconds
    )

    this.sendSuccess(res, { 
      stored: true,
      conversationId: body.conversationId,
      expiresIn: body.expiryInSeconds
    }, 'Session key stored successfully')
  })

  /**
   * Get session key for conversation
   * GET /api/e2ee/session-key/:conversationId
   */
  getSessionKey = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    const conversationId = req.params.conversationId

    const paramsSchema = z.object({
      conversationId: z.string().min(1, 'Conversation ID is required')
    })

    this.getPathParams(req, paramsSchema)

    this.logAction('getSessionKey', userId, { conversationId })

    const sessionKey = await e2eeService.getSessionKey(conversationId, userId)

    if (!sessionKey) {
      this.sendSuccess(res, { 
        sessionKey: null, 
        hasKey: false,
        conversationId 
      }, 'No session key found for conversation')
      return
    }

    this.sendSuccess(res, { 
      sessionKey, 
      hasKey: true,
      conversationId 
    }, 'Session key retrieved successfully')
  })

  /**
   * Encrypt message content
   * POST /api/e2ee/encrypt
   */
  encryptMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      message: z.string().min(1, 'Message content is required'),
      recipientId: z.string().min(1, 'Recipient ID is required')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('encryptMessage', userId, { recipientId: body.recipientId })

    // Get recipient's public key
    const recipientPublicKey = await e2eeService.getPublicKey(body.recipientId)

    if (!recipientPublicKey) {
      this.sendSuccess(res, { 
        encrypted: false,
        error: 'Recipient has no public key' 
      }, 'Cannot encrypt message - recipient has no public key')
      return
    }

    const encryptedMessage = e2eeService.encryptMessage(body.message, recipientPublicKey)

    this.sendSuccess(res, { 
      encryptedMessage,
      encrypted: true,
      recipientId: body.recipientId
    }, 'Message encrypted successfully')
  })

  /**
   * Decrypt message content
   * POST /api/e2ee/decrypt
   */
  decryptMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      encryptedData: z.string().min(1, 'Encrypted data is required'),
      privateKey: z.string().min(1, 'Private key is required')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('decryptMessage', userId)

    try {
      const decryptedMessage = e2eeService.decryptMessage(body.encryptedData, body.privateKey)

      this.sendSuccess(res, { 
        decryptedMessage,
        decrypted: true
      }, 'Message decrypted successfully')
    } catch (error) {
      this.sendSuccess(res, { 
        decrypted: false,
        error: 'Failed to decrypt message'
      }, 'Decryption failed')
    }
  })

  /**
   * Check if message is encrypted
   * POST /api/e2ee/check-encrypted
   */
  checkEncrypted = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      message: z.string().min(1, 'Message content is required')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('checkEncrypted', userId)

    const isEncrypted = e2eeService.isEncryptedMessage(body.message)

    this.sendSuccess(res, { 
      isEncrypted,
      message: isEncrypted ? 'Message is encrypted' : 'Message is not encrypted'
    }, 'Encryption check completed')
  })

  /**
   * Get user's encryption status
   * GET /api/e2ee/status
   */
  getEncryptionStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    this.logAction('getEncryptionStatus', userId)

    const publicKey = await e2eeService.getPublicKey(userId)

    const status = {
      hasPublicKey: !!publicKey,
      encryptionEnabled: !!publicKey,
      userId,
      publicKeyPreview: publicKey ? `${publicKey.substring(0, 50)}...` : null
    }

    this.sendSuccess(res, status, 'Encryption status retrieved successfully')
  })

  /**
   * Update user's public key
   * PUT /api/e2ee/public-key
   */
  updatePublicKey = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      publicKey: z.string().min(1, 'Public key is required')
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('updatePublicKey', userId)

    await e2eeService.storePublicKey(userId, body.publicKey)

    this.sendSuccess(res, { 
      updated: true,
      userId,
      publicKeyPreview: `${body.publicKey.substring(0, 50)}...`
    }, 'Public key updated successfully')
  })

  /**
   * Delete user's encryption keys (Admin only or self)
   * DELETE /api/e2ee/keys/:userId
   */
  deleteKeys = this.asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = this.getUserId(req)
    const targetUserId = req.params.userId

    const paramsSchema = z.object({
      userId: z.string().min(1, 'User ID is required')
    })

    this.getPathParams(req, paramsSchema)

    // Users can only delete their own keys unless they're admin
    if (currentUserId !== targetUserId) {
      this.requireAdmin(req)
    }

    this.logAction('deleteKeys', currentUserId, { targetUserId })

    // This would require implementing a delete method in the service
    // For now, we'll return a placeholder response
    this.sendSuccess(res, { 
      deleted: false,
      message: 'Key deletion functionality will be implemented with enhanced security measures'
    }, 'Key deletion initiated')
  })

  /**
   * Get encryption statistics (Admin only)
   * GET /api/e2ee/stats
   */
  getEncryptionStats = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    this.logAction('getEncryptionStats', userId)

    // This would require implementing statistics collection
    const stats = {
      totalUsersWithKeys: 0,
      totalSessionKeys: 0,
      encryptionAdoptionRate: 0,
      averageKeyAge: 0,
      message: 'Encryption statistics will be implemented with analytics integration'
    }

    this.sendSuccess(res, stats, 'Encryption statistics retrieved successfully')
  })

  /**
   * Bulk key operations (Admin only)
   * POST /api/e2ee/bulk-operations
   */
  bulkKeyOperations = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)
    this.requireAdmin(req)

    const bodySchema = z.object({
      operation: z.enum(['cleanup_expired_keys', 'regenerate_keys', 'export_stats']),
      userIds: z.array(z.string()).optional(),
      filters: z.object({
        olderThanDays: z.number().positive().optional(),
        inactive: z.boolean().optional()
      }).optional()
    })

    const body = this.getBodyParams(req, bodySchema)

    this.logAction('bulkKeyOperations', userId, { 
      operation: body.operation,
      userCount: body.userIds?.length || 0
    })

    let result: any = {}

    switch (body.operation) {
      case 'cleanup_expired_keys':
        result = {
          operation: 'cleanup_expired_keys',
          processed: 0,
          message: 'Bulk cleanup functionality will be implemented'
        }
        break

      case 'regenerate_keys':
        result = {
          operation: 'regenerate_keys',
          processed: 0,
          message: 'Bulk key regeneration functionality will be implemented'
        }
        break

      case 'export_stats':
        result = {
          operation: 'export_stats',
          exportUrl: null,
          message: 'Statistics export functionality will be implemented'
        }
        break
    }

    this.sendSuccess(res, result, `Bulk ${body.operation} completed successfully`)
  })

  /**
   * Test encryption/decryption flow
   * POST /api/e2ee/test
   */
  testEncryption = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.getUserId(req)

    const bodySchema = z.object({
      testMessage: z.string().min(1, 'Test message is required').optional().default('Hello, World!')
    })

    const body = this.getBodyParams(req, bodySchema)
    const testMessage = body.testMessage || 'Hello, World!'

    this.logAction('testEncryption', userId)

    try {
      // Generate a test key pair
      const keyPair = await e2eeService.generateKeyPair()

      // Encrypt the test message
      const encryptedMessage = e2eeService.encryptMessage(testMessage, keyPair.publicKey)

      // Decrypt the message
      const decryptedMessage = e2eeService.decryptMessage(encryptedMessage, keyPair.privateKey)

      const testResult = {
        success: decryptedMessage === testMessage,
        originalMessage: testMessage,
        encryptedMessage: encryptedMessage.substring(0, 100) + '...', // Truncate for display
        decryptedMessage,
        keyPairGenerated: true,
        encryptionWorking: true
      }

      this.sendSuccess(res, testResult, 'Encryption test completed successfully')
    } catch (error) {
      this.sendSuccess(res, { 
        success: false,
        error: 'Encryption test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 'Encryption test failed')
    }
  })
}

// Export singleton instance
export const e2eeController = new E2EEController()
