import crypto from "crypto"
import { logger } from "../utils/logger"
import { ApiError } from "../utils/apiError"
import { userRepository } from "@chatapp/database"
import { getRedisManager } from "../config/redis"

export class E2EEService {
  private redis = getRedisManager()

  /**
   * Generate key pair for a user
   */
  async generateKeyPair(): Promise<{
    publicKey: string
    privateKey: string
  }> {
    try {
      // Generate RSA key pair
      const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: "spki",
          format: "pem",
        },
        privateKeyEncoding: {
          type: "pkcs8",
          format: "pem",
        },
      })

      return {
        publicKey,
        privateKey,
      }
    } catch (error) {
      logger.error("Error generating key pair:", error)
      throw error
    }
  }

  /**
   * Store public key for a user
   */
  async storePublicKey(userId: string, publicKey: string): Promise<void> {
    try {
      // Update user record with public key
      await userRepository.update(userId, {
        e2eePublicKey: publicKey,
      } as any)
    } catch (error) {
      logger.error(`Error storing public key for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get public key for a user
   */
  async getPublicKey(userId: string): Promise<string | null> {
    try {
      const user = await userRepository.findById(userId)

      if (!user) {
        throw ApiError.notFound("User not found")
      }

      return (user as any).e2eePublicKey || null
    } catch (error) {
      logger.error(`Error getting public key for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Store session key for a conversation
   */
  async storeSessionKey(
    conversationId: string,
    userId: string,
    encryptedSessionKey: string,
    expiryInSeconds = 86400, // 24 hours
  ): Promise<void> {
    try {
      // Store in Redis with expiry
      await this.redis.set(`e2ee:session:${conversationId}:${userId}`, encryptedSessionKey, expiryInSeconds)
    } catch (error) {
      logger.error(`Error storing session key for conversation ${conversationId}, user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Get session key for a conversation
   */
  async getSessionKey(conversationId: string, userId: string): Promise<string | null> {
    try {
      return await this.redis.get(`e2ee:session:${conversationId}:${userId}`)
    } catch (error) {
      logger.error(`Error getting session key for conversation ${conversationId}, user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Encrypt message for a recipient
   */
  encryptMessage(message: string, recipientPublicKey: string): string {
    try {
      // Generate a random AES key
      const aesKey = crypto.randomBytes(32) // 256 bits
      const iv = crypto.randomBytes(16) // 128 bits

      // Encrypt the message with AES
      const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv)
      let encryptedMessage = cipher.update(message, "utf8", "base64")
      encryptedMessage += cipher.final("base64")
      const authTag = cipher.getAuthTag()

      // Encrypt the AES key with the recipient's public key
      const encryptedKey = crypto.publicEncrypt(
        {
          key: recipientPublicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        Buffer.concat([aesKey, iv, authTag]),
      )

      // Return the encrypted message and encrypted key
      return JSON.stringify({
        encryptedMessage,
        encryptedKey: encryptedKey.toString("base64"),
      })
    } catch (error) {
      logger.error("Error encrypting message:", error)
      throw error
    }
  }

  /**
   * Decrypt message with private key
   */
  decryptMessage(encryptedData: string, privateKey: string): string {
    try {
      const { encryptedMessage, encryptedKey } = JSON.parse(encryptedData)

      // Decrypt the AES key with the private key
      const decryptedKeyBuffer = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        Buffer.from(encryptedKey, "base64"),
      )

      // Extract AES key, IV, and auth tag
      const aesKey = decryptedKeyBuffer.slice(0, 32)
      const iv = decryptedKeyBuffer.slice(32, 48)
      const authTag = decryptedKeyBuffer.slice(48)

      // Decrypt the message with AES
      const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv)
      decipher.setAuthTag(authTag)
      let decryptedMessage = decipher.update(encryptedMessage, "base64", "utf8")
      decryptedMessage += decipher.final("utf8")

      return decryptedMessage
    } catch (error) {
      logger.error("Error decrypting message:", error)
      throw error
    }
  }

  /**
   * Verify if a message is encrypted
   */
  isEncryptedMessage(message: string): boolean {
    try {
      const data = JSON.parse(message)
      return (
        typeof data === "object" &&
        data !== null &&
        typeof data.encryptedMessage === "string" &&
        typeof data.encryptedKey === "string"
      )
    } catch (error) {
      return false
    }
  }
}

// Export singleton instance
export const e2eeService = new E2EEService()
