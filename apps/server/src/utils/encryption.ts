import crypto from 'crypto';
import { config } from '../config/config';
import { logger } from './logger';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits

/**
 * Derive encryption key from secret using PBKDF2
 */
const deriveKey = (salt: Buffer): Buffer => {
  try {
    return crypto.pbkdf2Sync(
      config.encryption.secret,
      salt,
      100000, // iterations
      KEY_LENGTH,
      'sha512'
    );
  } catch (error) {
    logger.error('Error deriving encryption key:', error);
    throw new Error('Failed to derive encryption key');
  }
};

/**
 * Generate a random salt
 */
const generateSalt = (): Buffer => {
  return crypto.randomBytes(SALT_LENGTH);
};

/**
 * Generate a random IV
 */
const generateIV = (): Buffer => {
  return crypto.randomBytes(IV_LENGTH);
};

/**
 * Encrypt a string using AES-256-GCM
 */
export const encrypt = (plaintext: string): string => {
  try {
    // Generate salt and IV
    const salt = generateSalt();
    const iv = generateIV();
    
    // Derive key from salt
    const key = deriveKey(salt);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the plaintext
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get the authentication tag
    const tag = cipher.getAuthTag();
    
    // Combine salt, iv, tag, and encrypted data
    const result = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]);
    
    return result.toString('base64');
  } catch (error) {
    logger.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt a string using AES-256-GCM
 */
export const decrypt = (encryptedData: string): string => {
  try {
    // Parse the encrypted data
    const buffer = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = buffer.subarray(0, SALT_LENGTH);
    const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive key from salt
    const key = deriveKey(salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Check if a string is encrypted (base64 format with correct length)
 */
export const isEncrypted = (data: string): boolean => {
  try {
    // Check if it's valid base64
    const buffer = Buffer.from(data, 'base64');
    
    // Check if the decoded data has the minimum required length
    const minLength = SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1; // +1 for at least 1 byte of encrypted data
    
    return buffer.length >= minLength && buffer.toString('base64') === data;
  } catch {
    return false;
  }
};

/**
 * Hash a password using bcrypt-compatible method
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    const bcrypt = await import('bcryptjs');
    return await bcrypt.hash(password, config.security.bcryptRounds);
  } catch (error) {
    logger.error('Password hashing error:', error);
    throw new Error('Failed to hash password');
  }
};

/**
 * Verify a password against its hash
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  try {
    const bcrypt = await import('bcryptjs');
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Password verification error:', error);
    throw new Error('Failed to verify password');
  }
};

/**
 * Generate a secure random token
 */
export const generateToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate a secure random string with custom alphabet
 */
export const generateSecureString = (length: number = 32, alphabet?: string): string => {
  const defaultAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const chars = alphabet || defaultAlphabet;
  
  let result = '';
  const randomBytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  
  return result;
};

/**
 * Generate a UUID v4
 */
export const generateUUID = (): string => {
  return crypto.randomUUID();
};

/**
 * Create a hash of data using SHA-256
 */
export const createHash = (data: string, algorithm: string = 'sha256'): string => {
  return crypto.createHash(algorithm).update(data).digest('hex');
};

/**
 * Create HMAC signature
 */
export const createHMAC = (data: string, secret: string, algorithm: string = 'sha256'): string => {
  return crypto.createHmac(algorithm, secret).update(data).digest('hex');
};

/**
 * Verify HMAC signature
 */
export const verifyHMAC = (data: string, signature: string, secret: string, algorithm: string = 'sha256'): boolean => {
  const expectedSignature = createHMAC(data, secret, algorithm);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};

/**
 * Encrypt sensitive fields in an object
 */
export const encryptFields = <T extends Record<string, any>>(
  obj: T,
  fieldsToEncrypt: (keyof T)[]
): T => {
  const result = { ...obj };
  
  for (const field of fieldsToEncrypt) {
    if (result[field] && typeof result[field] === 'string') {
      (result[field] as any) = encrypt(result[field] as string);
    }
  }
  
  return result;
};

/**
 * Decrypt sensitive fields in an object
 */
export const decryptFields = <T extends Record<string, any>>(
  obj: T,
  fieldsToDecrypt: (keyof T)[]
): T => {
  const result = { ...obj };
  
  for (const field of fieldsToDecrypt) {
    if (result[field] && typeof result[field] === 'string' && isEncrypted(result[field] as string)) {
      try {
        (result[field] as any) = decrypt(result[field] as string);
      } catch (error) {
        logger.warn(`Failed to decrypt field ${String(field)}:`, error);
        // Keep the original value if decryption fails
      }
    }
  }
  
  return result;
};

/**
 * Generate a time-based one-time password (TOTP) secret
 */
export const generateTOTPSecret = (): string => {
  return generateSecureString(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
};

/**
 * Generate a JWT-compatible secret
 */
export const generateJWTSecret = (): string => {
  return generateToken(64); // 512 bits
};

/**
 * Secure string comparison to prevent timing attacks
 */
export const secureCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * Generate a cryptographically secure random number
 */
export const secureRandom = (min: number, max: number): number => {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValue = Math.pow(256, bytesNeeded);
  const threshold = maxValue - (maxValue % range);
  
  let randomValue;
  do {
    const randomBytes = crypto.randomBytes(bytesNeeded);
    randomValue = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      randomValue = (randomValue << 8) + randomBytes[i];
    }
  } while (randomValue >= threshold);
  
  return min + (randomValue % range);
};

/**
 * Encrypt file content
 */
export const encryptFile = async (filePath: string, outputPath: string): Promise<void> => {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf8');
    const encrypted = encrypt(content);
    await fs.writeFile(outputPath, encrypted);
  } catch (error) {
    logger.error('File encryption error:', error);
    throw new Error('Failed to encrypt file');
  }
};

/**
 * Decrypt file content
 */
export const decryptFile = async (filePath: string, outputPath: string): Promise<void> => {
  try {
    const fs = await import('fs/promises');
    const encryptedContent = await fs.readFile(filePath, 'utf8');
    const decrypted = decrypt(encryptedContent);
    await fs.writeFile(outputPath, decrypted);
  } catch (error) {
    logger.error('File decryption error:', error);
    throw new Error('Failed to decrypt file');
  }
};

/**
 * Key derivation for different purposes
 */
export const deriveKeyForPurpose = (purpose: string, salt?: string): string => {
  const purposeSalt = salt || purpose;
  const derivedKey = crypto.pbkdf2Sync(
    config.encryption.secret,
    purposeSalt,
    100000,
    32,
    'sha512'
  );
  return derivedKey.toString('hex');
};

/**
 * Encryption utilities for different data types
 */
export const encryptionUtils = {
  // Encrypt JSON data
  encryptJSON: (data: any): string => {
    return encrypt(JSON.stringify(data));
  },
  
  // Decrypt JSON data
  decryptJSON: <T = any>(encryptedData: string): T => {
    const decrypted = decrypt(encryptedData);
    return JSON.parse(decrypted);
  },
  
  // Encrypt with expiration
  encryptWithExpiration: (data: string, expirationMs: number): string => {
    const expirationTime = Date.now() + expirationMs;
    const payload = { data, expirationTime };
    return encrypt(JSON.stringify(payload));
  },
  
  // Decrypt with expiration check
  decryptWithExpiration: (encryptedData: string): string | null => {
    try {
      const decrypted = decrypt(encryptedData);
      const payload = JSON.parse(decrypted);
      
      if (Date.now() > payload.expirationTime) {
        return null; // Expired
      }
      
      return payload.data;
    } catch {
      return null;
    }
  },
};

export default {
  encrypt,
  decrypt,
  isEncrypted,
  hashPassword,
  verifyPassword,
  generateToken,
  generateSecureString,
  generateUUID,
  createHash,
  createHMAC,
  verifyHMAC,
  encryptFields,
  decryptFields,
  generateTOTPSecret,
  generateJWTSecret,
  secureCompare,
  secureRandom,
  encryptFile,
  decryptFile,
  deriveKeyForPurpose,
  encryptionUtils,
};
