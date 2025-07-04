import crypto from "crypto"
import { config } from "../config"
import { logger } from "../utils/logger"

// Constants for encryption
const ALGORITHM = "aes-256-gcm"
const KEY_SIZE = 32 // 256 bits
const IV_SIZE = 16 // 128 bits
const AUTH_TAG_SIZE = 16 // 128 bits
const SALT_SIZE = 16

/**
 * Generate a secure encryption key from a password and salt
 */
export const deriveKey = (password: string, salt: Buffer): Buffer => {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_SIZE, "sha512")
}

/**
 * Encrypt data with AES-256-GCM
 * Returns a string in the format: salt:iv:authTag:encryptedData (all hex encoded)
 */
export const encrypt = (text: string, password: string = config.encryption.secret): string => {
  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_SIZE)
    const iv = crypto.randomBytes(IV_SIZE)

    // Derive key from password and salt
    const key = deriveKey(password, salt)

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    // Encrypt data
    let encrypted = cipher.update(text, "utf8", "hex")
    encrypted += cipher.final("hex")

    // Get auth tag
    const authTag = cipher.getAuthTag()

    // Return salt:iv:authTag:encryptedData
    return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`
  } catch (error) {
    logger.error("Encryption error:", error)
    throw new Error("Failed to encrypt data")
  }
}

/**
 * Decrypt data with AES-256-GCM
 * Expects a string in the format: salt:iv:authTag:encryptedData (all hex encoded)
 */
export const decrypt = (encryptedText: string, password: string = config.encryption.secret): string => {
  try {
    // Split the encrypted text into components
    const parts = encryptedText.split(":")
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted text format")
    }

    const salt = Buffer.from(parts[0], "hex")
    const iv = Buffer.from(parts[1], "hex")
    const authTag = Buffer.from(parts[2], "hex")
    const encrypted = parts[3]

    // Derive key from password and salt
    const key = deriveKey(password, salt)

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    // Decrypt data
    let decrypted = decipher.update(encrypted, "hex", "utf8")
    decrypted += decipher.final("utf8")

    return decrypted
  } catch (error) {
    logger.error("Decryption error:", error)
    throw new Error("Failed to decrypt data")
  }
}

/**
 * Check if a string is encrypted
 */
export const isEncrypted = (text: string): boolean => {
  // Check if the text has the format of salt:iv:authTag:encrypted
  const parts = text.split(":")
  if (parts.length !== 4) {
    return false
  }

  // Check if all parts are valid hex strings of correct length
  try {
    const salt = Buffer.from(parts[0], "hex")
    const iv = Buffer.from(parts[1], "hex")
    const authTag = Buffer.from(parts[2], "hex")

    return (
      salt.length === SALT_SIZE &&
      iv.length === IV_SIZE &&
      authTag.length === AUTH_TAG_SIZE &&
      /^[0-9a-f]+$/i.test(parts[3])
    )
  } catch (error) {
    return false
  }
}

/**
 * Generate a secure random token
 */
export const generateSecureToken = (length = 32): string => {
  return crypto.randomBytes(length).toString("hex")
}

/**
 * Hash a password with bcrypt
 * This is a wrapper around bcrypt for consistency
 */
export const hashPassword = async (password: string): Promise<string> => {
  const bcrypt = require("bcrypt")
  return bcrypt.hash(password, config.security.bcryptRounds)
}

/**
 * Compare a password with a hash
 * This is a wrapper around bcrypt for consistency
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  const bcrypt = require("bcrypt")
  return bcrypt.compare(password, hash)
}

/**
 * Generate a secure hash of data using SHA-256
 */
export const hashData = (data: string): string => {
  return crypto.createHash("sha256").update(data).digest("hex")
}

/**
 * Generate a HMAC signature
 */
export const generateHmac = (data: string, secret: string = config.encryption.secret): string => {
  return crypto.createHmac("sha256", secret).update(data).digest("hex")
}

/**
 * Verify a HMAC signature
 */
export const verifyHmac = (data: string, signature: string, secret: string = config.encryption.secret): boolean => {
  const expectedSignature = generateHmac(data, secret)
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
}

/**
 * Advanced encryption utilities for message-level security
 */
export const messageEncryption = {
  /**
   * Encrypt a message with metadata
   */
  encryptMessage: (content: string, senderId: string, conversationId: string): string => {
    const messageData = {
      content,
      senderId,
      conversationId,
      timestamp: Date.now(),
      nonce: generateSecureToken(16)
    }
    return encrypt(JSON.stringify(messageData))
  },

  /**
   * Decrypt a message and validate metadata
   */
  decryptMessage: (encryptedMessage: string): {
    content: string
    senderId: string
    conversationId: string
    timestamp: number
    nonce: string
  } => {
    const decryptedData = decrypt(encryptedMessage)
    return JSON.parse(decryptedData)
  },

  /**
   * Encrypt file metadata
   */
  encryptFileMetadata: (metadata: Record<string, any>): string => {
    return encrypt(JSON.stringify(metadata))
  },

  /**
   * Decrypt file metadata
   */
  decryptFileMetadata: (encryptedMetadata: string): Record<string, any> => {
    const decryptedData = decrypt(encryptedMetadata)
    return JSON.parse(decryptedData)
  }
}

/**
 * Key derivation for different security contexts
 */
export const keyDerivation = {
  /**
   * Derive encryption key for user-specific data
   */
  deriveUserKey: (userId: string, purpose: string): string => {
    const salt = `${userId}:${purpose}:${config.encryption.secret}`
    return crypto.pbkdf2Sync(salt, config.encryption.secret, 100000, 32, "sha512").toString("hex")
  },

  /**
   * Derive encryption key for conversation-specific data
   */
  deriveConversationKey: (conversationId: string): string => {
    const salt = `conversation:${conversationId}:${config.encryption.secret}`
    return crypto.pbkdf2Sync(salt, config.encryption.secret, 100000, 32, "sha512").toString("hex")
  },

  /**
   * Derive encryption key for group-specific data
   */
  deriveGroupKey: (groupId: string): string => {
    const salt = `group:${groupId}:${config.encryption.secret}`
    return crypto.pbkdf2Sync(salt, config.encryption.secret, 100000, 32, "sha512").toString("hex")
  }
}

/**
 * Secure session management
 */
export const sessionSecurity = {
  /**
   * Generate secure session token
   */
  generateSessionToken: (): string => {
    return generateSecureToken(64)
  },

  /**
   * Encrypt session data
   */
  encryptSessionData: (sessionData: Record<string, any>): string => {
    const dataWithExpiry = {
      ...sessionData,
      createdAt: Date.now(),
      expiresAt: Date.now() + (config.jwt.refreshExpiresIn === '30d' ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)
    }
    return encrypt(JSON.stringify(dataWithExpiry))
  },

  /**
   * Decrypt and validate session data
   */
  decryptSessionData: (encryptedSession: string): Record<string, any> | null => {
    try {
      const decryptedData = decrypt(encryptedSession)
      const sessionData = JSON.parse(decryptedData)
      
      // Check if session has expired
      if (sessionData.expiresAt && Date.now() > sessionData.expiresAt) {
        return null
      }
      
      return sessionData
    } catch (error) {
      logger.error("Session decryption error:", error)
      return null
    }
  }
}

/**
 * Database field encryption utilities
 */
export const fieldEncryption = {
  /**
   * Encrypt sensitive user fields
   */
  encryptUserFields: <T extends Record<string, any>>(
    userData: T,
    fieldsToEncrypt: (keyof T)[] = ['email', 'phone', 'personalInfo']
  ): T => {
    const encrypted = { ...userData }
    
    for (const field of fieldsToEncrypt) {
      if (encrypted[field] && typeof encrypted[field] === 'string') {
        encrypted[field] = encrypt(encrypted[field] as string) as any
      } else if (encrypted[field] && typeof encrypted[field] === 'object') {
        encrypted[field] = encrypt(JSON.stringify(encrypted[field])) as any
      }
    }
    
    return encrypted
  },

  /**
   * Decrypt sensitive user fields
   */
  decryptUserFields: <T extends Record<string, any>>(
    encryptedData: T,
    fieldsToDecrypt: (keyof T)[] = ['email', 'phone', 'personalInfo']
  ): T => {
    const decrypted = { ...encryptedData }
    
    for (const field of fieldsToDecrypt) {
      if (decrypted[field] && typeof decrypted[field] === 'string' && isEncrypted(decrypted[field] as string)) {
        try {
          const decryptedValue = decrypt(decrypted[field] as string)
          
          // Try to parse as JSON, fallback to string
          try {
            decrypted[field] = JSON.parse(decryptedValue) as any
          } catch {
            decrypted[field] = decryptedValue as any
          }
        } catch (error) {
          logger.warn(`Failed to decrypt field ${String(field)}:`, error)
        }
      }
    }
    
    return decrypted
  }
}

/**
 * API security utilities
 */
export const apiSecurity = {
  /**
   * Generate API key with embedded metadata
   */
  generateApiKey: (userId: string, permissions: string[] = []): string => {
    const keyData = {
      userId,
      permissions,
      createdAt: Date.now(),
      keyId: generateSecureToken(16)
    }
    return `ak_${encrypt(JSON.stringify(keyData))}`
  },

  /**
   * Validate and decode API key
   */
  validateApiKey: (apiKey: string): {
    userId: string
    permissions: string[]
    createdAt: number
    keyId: string
  } | null => {
    try {
      if (!apiKey.startsWith('ak_')) {
        return null
      }
      
      const encryptedData = apiKey.substring(3)
      const decryptedData = decrypt(encryptedData)
      return JSON.parse(decryptedData)
    } catch (error) {
      logger.warn("Invalid API key:", error)
      return null
    }
  },

  /**
   * Generate request signature for API authentication
   */
  generateRequestSignature: (method: string, url: string, body: string, timestamp: number, secret: string): string => {
    const payload = `${method}:${url}:${body}:${timestamp}`
    return generateHmac(payload, secret)
  },

  /**
   * Verify request signature
   */
  verifyRequestSignature: (
    method: string,
    url: string,
    body: string,
    timestamp: number,
    signature: string,
    secret: string,
    maxAge: number = 300000 // 5 minutes
  ): boolean => {
    // Check timestamp to prevent replay attacks
    if (Date.now() - timestamp > maxAge) {
      return false
    }
    
    const expectedSignature = apiSecurity.generateRequestSignature(method, url, body, timestamp, secret)
    return verifyHmac(`${method}:${url}:${body}:${timestamp}`, signature, secret)
  }
}

export const encryption = {
  encrypt,
  decrypt,
  isEncrypted,
  generateSecureToken,
  hashPassword,
  comparePassword,
  hashData,
  generateHmac,
  verifyHmac,
  messageEncryption,
  keyDerivation,
  sessionSecurity,
  fieldEncryption,
  apiSecurity,
}
