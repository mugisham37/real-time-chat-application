import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseValidator } from './base.validator'

/**
 * End-to-End Encryption Validator
 * Validates all E2EE-related requests with comprehensive security and cryptographic validation
 */
export class E2EEValidator extends BaseValidator {
  /**
   * Validate get public key request
   */
  validateGetPublicKey = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        userId: z.string()
          .min(1, 'User ID is required')
          .max(100, 'Invalid user ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getPublicKey', req.user?.id, { 
        targetUserId: params.userId
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate store session key request
   */
  validateStoreSessionKey = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        conversationId: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format'),
        encryptedSessionKey: z.string()
          .min(1, 'Encrypted session key is required')
          .max(10000, 'Encrypted session key too long')
          .refine(val => this.isValidBase64(val), {
            message: 'Encrypted session key must be valid base64'
          }),
        expiryInSeconds: z.number()
          .positive('Expiry must be positive')
          .max(2592000, 'Expiry cannot exceed 30 days (2592000 seconds)')
          .default(86400) // 24 hours default
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional security validations
      this.validateSessionKeyFormat(body.encryptedSessionKey)
      this.validateSessionKeyExpiry(body.expiryInSeconds)

      this.logValidation('storeSessionKey', req.user?.id, { 
        conversationId: body.conversationId,
        expiryInSeconds: body.expiryInSeconds,
        keyLength: body.encryptedSessionKey.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate get session key request
   */
  validateGetSessionKey = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        conversationId: z.string()
          .min(1, 'Conversation ID is required')
          .max(100, 'Invalid conversation ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      this.logValidation('getSessionKey', req.user?.id, { 
        conversationId: params.conversationId
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate encrypt message request
   */
  validateEncryptMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        message: z.string()
          .min(1, 'Message content is required')
          .max(50000, 'Message too long for encryption'),
        recipientId: z.string()
          .min(1, 'Recipient ID is required')
          .max(100, 'Invalid recipient ID format')
          .refine(val => val !== req.user?.id, {
            message: 'Cannot encrypt message for yourself'
          })
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional message validation
      this.validateMessageContent(body.message)

      // Rate limiting for encryption operations
      this.validateEncryptionRateLimit(req)

      this.logValidation('encryptMessage', req.user?.id, { 
        recipientId: body.recipientId,
        messageLength: body.message.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate decrypt message request
   */
  validateDecryptMessage = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        encryptedData: z.string()
          .min(1, 'Encrypted data is required')
          .max(100000, 'Encrypted data too long')
          .refine(val => this.isValidBase64(val), {
            message: 'Encrypted data must be valid base64'
          }),
        privateKey: z.string()
          .min(1, 'Private key is required')
          .max(10000, 'Private key too long')
          .refine(val => this.isValidPrivateKey(val), {
            message: 'Invalid private key format'
          })
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional security validations
      this.validateEncryptedDataFormat(body.encryptedData)

      // Rate limiting for decryption operations
      this.validateDecryptionRateLimit(req)

      this.logValidation('decryptMessage', req.user?.id, { 
        encryptedDataLength: body.encryptedData.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate check encrypted request
   */
  validateCheckEncrypted = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        message: z.string()
          .min(1, 'Message content is required')
          .max(100000, 'Message too long for analysis')
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      this.logValidation('checkEncrypted', req.user?.id, { 
        messageLength: body.message.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate update public key request
   */
  validateUpdatePublicKey = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        publicKey: z.string()
          .min(1, 'Public key is required')
          .max(10000, 'Public key too long')
          .refine(val => this.isValidPublicKey(val), {
            message: 'Invalid public key format'
          })
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Additional public key validations
      this.validatePublicKeyStrength(body.publicKey)

      this.logValidation('updatePublicKey', req.user?.id, { 
        publicKeyLength: body.publicKey.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate delete keys request
   */
  validateDeleteKeys = (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramsSchema = z.object({
        userId: z.string()
          .min(1, 'User ID is required')
          .max(100, 'Invalid user ID format')
      })

      const params = this.validateData(paramsSchema, req.params, 'path parameters')

      // Users can only delete their own keys unless they're admin
      if (req.user?.id !== params.userId) {
        this.validateAdmin(req)
      }

      this.logValidation('deleteKeys', req.user?.id, { 
        targetUserId: params.userId
      })

      req.params = params
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate bulk key operations request (Admin only)
   */
  validateBulkKeyOperations = (req: Request, res: Response, next: NextFunction) => {
    try {
      this.validateAdmin(req)

      const bodySchema = z.object({
        operation: z.enum(['cleanup_expired_keys', 'regenerate_keys', 'export_stats'], {
          errorMap: () => ({ message: 'Invalid bulk operation' })
        }),
        userIds: z.array(z.string().max(100))
          .max(1000, 'Cannot process more than 1000 users at once')
          .optional(),
        filters: z.object({
          olderThanDays: z.number()
            .positive('Days must be positive')
            .max(365, 'Cannot exceed 1 year')
            .optional(),
          inactive: z.boolean().optional()
        }).optional()
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Validate bulk operation requirements
      this.validateBulkOperationRequirements(body.operation, body.filters)

      this.logValidation('bulkKeyOperations', req.user?.id, { 
        operation: body.operation,
        userCount: body.userIds?.length || 0
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate test encryption request
   */
  validateTestEncryption = (req: Request, res: Response, next: NextFunction) => {
    try {
      const bodySchema = z.object({
        testMessage: z.string()
          .min(1, 'Test message cannot be empty')
          .max(1000, 'Test message too long')
          .default('Hello, World!')
      })

      let body = this.sanitizeObject(req.body)
      body = this.validateData(bodySchema, body, 'request body')

      // Rate limiting for test operations
      this.validateTestRateLimit(req)

      this.logValidation('testEncryption', req.user?.id, { 
        testMessageLength: body.testMessage.length
      })

      req.body = body
      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate base64 format
   */
  private isValidBase64(str: string): boolean {
    try {
      return btoa(atob(str)) === str
    } catch {
      return false
    }
  }

  /**
   * Validate public key format
   */
  private isValidPublicKey(publicKey: string): boolean {
    // Basic validation for PEM format public key
    const pemRegex = /^-----BEGIN PUBLIC KEY-----[\s\S]*-----END PUBLIC KEY-----$/
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
    
    return pemRegex.test(publicKey) || (base64Regex.test(publicKey) && publicKey.length > 100)
  }

  /**
   * Validate private key format
   */
  private isValidPrivateKey(privateKey: string): boolean {
    // Basic validation for PEM format private key
    const pemRegex = /^-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]*-----END (RSA )?PRIVATE KEY-----$/
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
    
    return pemRegex.test(privateKey) || (base64Regex.test(privateKey) && privateKey.length > 100)
  }

  /**
   * Validate session key format
   */
  private validateSessionKeyFormat(encryptedSessionKey: string): void {
    // Validate that the encrypted session key has reasonable length
    const decodedLength = encryptedSessionKey.length * 0.75 // Approximate decoded length
    
    if (decodedLength < 32) { // Minimum 256 bits
      throw new Error('Session key appears too short for secure encryption')
    }

    if (decodedLength > 8192) { // Maximum reasonable size
      throw new Error('Session key appears too long - possible data corruption')
    }
  }

  /**
   * Validate session key expiry
   */
  private validateSessionKeyExpiry(expiryInSeconds: number): void {
    // Minimum expiry of 1 hour for security
    if (expiryInSeconds < 3600) {
      throw new Error('Session key expiry cannot be less than 1 hour')
    }

    // Maximum expiry of 30 days
    if (expiryInSeconds > 2592000) {
      throw new Error('Session key expiry cannot exceed 30 days')
    }
  }

  /**
   * Validate message content for encryption
   */
  private validateMessageContent(message: string): void {
    // Check for suspicious patterns that might indicate already encrypted content
    if (this.isValidBase64(message) && message.length > 100) {
      throw new Error('Message appears to already be encrypted or encoded')
    }

    // Check for extremely long messages that might cause performance issues
    if (message.length > 50000) {
      throw new Error('Message too long for efficient encryption')
    }

    // Check for null bytes or other problematic characters
    if (message.includes('\0')) {
      throw new Error('Message contains null bytes which may cause encryption issues')
    }
  }

  /**
   * Validate encrypted data format
   */
  private validateEncryptedDataFormat(encryptedData: string): void {
    // Validate that encrypted data looks reasonable
    if (!this.isValidBase64(encryptedData)) {
      throw new Error('Encrypted data is not valid base64')
    }

    const decodedLength = encryptedData.length * 0.75
    
    if (decodedLength < 16) {
      throw new Error('Encrypted data appears too short')
    }

    if (decodedLength > 100000) {
      throw new Error('Encrypted data appears too long')
    }
  }

  /**
   * Validate public key strength
   */
  private validatePublicKeyStrength(publicKey: string): void {
    // Basic validation for key strength
    if (publicKey.length < 200) {
      throw new Error('Public key appears too short - minimum 2048-bit keys required')
    }

    // Check for common weak key patterns
    const weakPatterns = [
      /AAAA/g,
      /0000/g,
      /1111/g,
      /FFFF/g
    ]

    const matchCount = weakPatterns.reduce((count, pattern) => {
      const matches = publicKey.match(pattern)
      return count + (matches ? matches.length : 0)
    }, 0)

    if (matchCount > 5) {
      throw new Error('Public key contains suspicious patterns - may be weak')
    }
  }

  /**
   * Validate encryption rate limiting
   */
  private validateEncryptionRateLimit(req: Request): void {
    // Rate limiting for encryption operations to prevent abuse
    const maxEncryptionsPerMinute = 100
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxEncryptionsPerMinute, windowMs)
  }

  /**
   * Validate decryption rate limiting
   */
  private validateDecryptionRateLimit(req: Request): void {
    // Rate limiting for decryption operations
    const maxDecryptionsPerMinute = 100
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxDecryptionsPerMinute, windowMs)
  }

  /**
   * Validate test rate limiting
   */
  private validateTestRateLimit(req: Request): void {
    // Rate limiting for test operations
    const maxTestsPerMinute = 10
    const windowMs = 60 * 1000 // 1 minute
    
    this.validateRateLimit(req, maxTestsPerMinute, windowMs)
  }

  /**
   * Validate bulk operation requirements
   */
  private validateBulkOperationRequirements(operation: string, filters: any): void {
    switch (operation) {
      case 'cleanup_expired_keys':
        if (!filters?.olderThanDays) {
          throw new Error('Cleanup operation requires olderThanDays filter')
        }
        if (filters.olderThanDays < 30) {
          throw new Error('Cleanup can only target keys older than 30 days')
        }
        break

      case 'regenerate_keys':
        // Regeneration might have specific requirements
        break

      case 'export_stats':
        // Export might have specific requirements
        break
    }
  }

  /**
   * Validate E2EE permissions
   */
  validateE2EEPermissions = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. User has E2EE enabled
      // 2. User has necessary permissions
      // 3. Feature is enabled for the user's plan
      
      const userId = req.user?.id
      if (!userId) {
        throw new Error('User authentication required for E2EE operations')
      }

      // Placeholder - would integrate with user service and feature flags
      this.logValidation('e2eePermissions', userId)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Validate cryptographic security
   */
  validateCryptographicSecurity = (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would validate:
      // 1. Secure connection (HTTPS)
      // 2. Proper headers for cryptographic operations
      // 3. Client capabilities
      
      // Check for secure connection
      if (!req.secure && req.headers['x-forwarded-proto'] !== 'https') {
        throw new Error('E2EE operations require secure HTTPS connection')
      }

      // Check for required security headers
      const requiredHeaders = ['user-agent', 'origin']
      for (const header of requiredHeaders) {
        if (!req.headers[header]) {
          throw new Error(`Missing required header: ${header}`)
        }
      }

      this.logValidation('cryptographicSecurity', req.user?.id)

      next()
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create comprehensive validation middleware for E2EE endpoints
   */
  createE2EEValidation = (validationType: 'keys' | 'encryption' | 'session' | 'admin' | 'test') => {
    const validators = [this.validateE2EEPermissions, this.validateCryptographicSecurity]

    switch (validationType) {
      case 'keys':
        validators.push(this.validateUpdatePublicKey)
        break
      case 'encryption':
        validators.push(this.validateEncryptMessage)
        break
      case 'session':
        validators.push(this.validateStoreSessionKey)
        break
      case 'admin':
        validators.push(this.validateBulkKeyOperations)
        break
      case 'test':
        validators.push(this.validateTestEncryption)
        break
    }

    return this.chainValidators(...validators)
  }
}

// Export singleton instance
export const e2eeValidator = new E2EEValidator()
