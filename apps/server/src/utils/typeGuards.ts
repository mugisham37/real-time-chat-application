/**
 * Type guard utilities for ensuring type safety across the application
 */

/**
 * Checks if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Checks if a value is a valid object (not null, not array)
 */
export function isValidObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates and transforms notification data with proper type guards
 */
export function validateNotificationData(data: {
  recipient?: unknown;
  type?: unknown;
  content?: unknown;
  sender?: unknown;
  relatedId?: unknown;
  relatedType?: unknown;
  metadata?: unknown;
}): {
  recipient: string;
  type: string;
  content: string;
  sender?: string;
  relatedId?: string;
  relatedType?: string;
  metadata?: Record<string, any>;
} {
  // Validate required fields
  if (!isNonEmptyString(data.recipient)) {
    throw new Error('Recipient must be a non-empty string');
  }
  
  if (!isNonEmptyString(data.type)) {
    throw new Error('Type must be a non-empty string');
  }
  
  if (!isNonEmptyString(data.content)) {
    throw new Error('Content must be a non-empty string');
  }

  // Validate content length
  if (data.content.length > 500) {
    throw new Error('Content must not exceed 500 characters');
  }

  // Return validated data with proper types
  return {
    recipient: data.recipient.trim(),
    type: data.type.trim(),
    content: data.content.trim(),
    sender: isNonEmptyString(data.sender) ? data.sender.trim() : undefined,
    relatedId: isNonEmptyString(data.relatedId) ? data.relatedId.trim() : undefined,
    relatedType: isNonEmptyString(data.relatedType) ? data.relatedType.trim() : undefined,
    metadata: isValidObject(data.metadata) ? data.metadata : undefined
  };
}

/**
 * Validates notification type against allowed values
 */
export function validateNotificationType(type: string): string {
  const allowedTypes = [
    'new_message',
    'mention', 
    'message_reaction',
    'group_invite',
    'incoming_call',
    'missed_call',
    'call_ended',
    'system'
  ];

  if (!allowedTypes.includes(type)) {
    throw new Error(`Invalid notification type: ${type}. Allowed types: ${allowedTypes.join(', ')}`);
  }

  return type;
}

/**
 * Validates user ID format
 */
export function validateUserId(userId: unknown): string {
  if (!isNonEmptyString(userId)) {
    throw new Error('User ID must be a non-empty string');
  }

  // Add additional validation if needed (e.g., UUID format, length constraints)
  if (userId.length < 1 || userId.length > 100) {
    throw new Error('User ID must be between 1 and 100 characters');
  }

  return userId.trim();
}

/**
 * Sanitizes and validates notification content
 */
export function sanitizeNotificationContent(content: string): string {
  if (!isNonEmptyString(content)) {
    throw new Error('Content must be a non-empty string');
  }

  // Remove potentially harmful characters and trim
  const sanitized = content
    .replace(/[<>]/g, '') // Remove angle brackets to prevent XSS
    .trim();

  if (sanitized.length === 0) {
    throw new Error('Content cannot be empty after sanitization');
  }

  if (sanitized.length > 500) {
    throw new Error('Content must not exceed 500 characters');
  }

  return sanitized;
}
