/**
 * Validators Index
 * Central export point for all validation middleware
 */

// Base validator
export { BaseValidator } from './base.validator'

// Individual validators
export { analyticsValidator, AnalyticsValidator } from './analytics.validator'
export { authValidator, AuthValidator } from './auth.validator'
export { callValidator, CallValidator } from './call.validator'
export { contentModerationValidator, ContentModerationValidator } from './contentModeration.validator'
export { conversationValidator, ConversationValidator } from './conversation.validator'
export { e2eeValidator, E2EEValidator } from './e2ee.validator'
export { fileManagementValidator, FileManagementValidator } from './fileManagement.validator'
export { groupValidator, GroupValidator } from './group.validator'
export { groupInvitationValidator, GroupInvitationValidator } from './groupInvitation.validator'
export { groupJoinRequestValidator, GroupJoinRequestValidator } from './groupJoinRequest.validator'
export { messageValidator, MessageValidator } from './message.validator'
export { notificationValidator, NotificationValidator } from './notification.validator'
export { presenceValidator, PresenceValidator } from './presence.validator'
export { scheduledMessageValidator, ScheduledMessageValidator } from './scheduledMessage.validator'
export { userValidator, UserValidator } from './user.validator'

// Import validator instances
import { analyticsValidator } from './analytics.validator'
import { authValidator } from './auth.validator'
import { callValidator } from './call.validator'
import { contentModerationValidator } from './contentModeration.validator'
import { conversationValidator } from './conversation.validator'
import { e2eeValidator } from './e2ee.validator'
import { fileManagementValidator } from './fileManagement.validator'
import { groupValidator } from './group.validator'
import { groupInvitationValidator } from './groupInvitation.validator'
import { groupJoinRequestValidator } from './groupJoinRequest.validator'
import { messageValidator } from './message.validator'
import { notificationValidator } from './notification.validator'
import { presenceValidator } from './presence.validator'
import { scheduledMessageValidator } from './scheduledMessage.validator'
import { userValidator } from './user.validator'

// Validator types for type safety
export type ValidatorInstance = 
  | typeof analyticsValidator
  | typeof authValidator
  | typeof callValidator
  | typeof contentModerationValidator
  | typeof conversationValidator
  | typeof e2eeValidator
  | typeof fileManagementValidator
  | typeof groupValidator
  | typeof groupInvitationValidator
  | typeof groupJoinRequestValidator
  | typeof messageValidator
  | typeof notificationValidator
  | typeof presenceValidator
  | typeof scheduledMessageValidator
  | typeof userValidator

// Validators registry
export const validators = {
  analytics: analyticsValidator,
  auth: authValidator,
  call: callValidator,
  contentModeration: contentModerationValidator,
  conversation: conversationValidator,
  e2ee: e2eeValidator,
  fileManagement: fileManagementValidator,
  group: groupValidator,
  groupInvitation: groupInvitationValidator,
  groupJoinRequest: groupJoinRequestValidator,
  message: messageValidator,
  notification: notificationValidator,
  presence: presenceValidator,
  scheduledMessage: scheduledMessageValidator,
  user: userValidator
} as const

// Validation middleware factory
export const createValidationMiddleware = (
  validatorName: keyof typeof validators,
  validationType: string
) => {
  const validator = validators[validatorName]
  
  if (!validator) {
    throw new Error(`Validator ${validatorName} not found`)
  }

  // Return appropriate validation method based on type
  switch (validatorName) {
    case 'analytics':
      return analyticsValidator.createAnalyticsValidation(validationType as any)
    case 'auth':
      return authValidator.createAuthValidation(validationType as any)
    case 'call':
      return callValidator.createCallValidation(validationType as any)
    case 'contentModeration':
      return contentModerationValidator.createModerationValidation(validationType as any)
    case 'conversation':
      return conversationValidator.createConversationValidation(validationType as any)
    case 'e2ee':
      return e2eeValidator.createE2EEValidation(validationType as any)
    case 'fileManagement':
      return fileManagementValidator.createFileManagementValidation(validationType as any)
    case 'group':
      return groupValidator.createGroupValidation(validationType as any)
    case 'groupInvitation':
      return groupInvitationValidator.createInvitationValidation(validationType as any)
    case 'groupJoinRequest':
      return groupJoinRequestValidator.createJoinRequestValidation(validationType as any)
    case 'message':
      return messageValidator.createMessageValidation(validationType as any)
    case 'notification':
      return notificationValidator.createNotificationValidation(validationType as any)
    case 'presence':
      return presenceValidator.createPresenceValidation(validationType as any)
    case 'scheduledMessage':
      return scheduledMessageValidator.createScheduledMessageValidation(validationType as any)
    case 'user':
      return userValidator.createUserValidation(validationType as any)
    default:
      throw new Error(`Validation type ${validationType} not supported for ${validatorName}`)
  }
}

// Common validation patterns
export const commonValidations = {
  // ID validation
  validateId: (fieldName: string = 'id') => ({
    [fieldName]: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^[a-zA-Z0-9_-]+$'
    }
  }),

  // Pagination validation
  validatePagination: () => ({
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 100,
      default: 20
    },
    offset: {
      type: 'number',
      minimum: 0,
      default: 0
    }
  }),

  // Date range validation
  validateDateRange: () => ({
    startDate: {
      type: 'string',
      format: 'date-time',
      optional: true
    },
    endDate: {
      type: 'string',
      format: 'date-time',
      optional: true
    }
  }),

  // Search validation
  validateSearch: () => ({
    query: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^[a-zA-Z0-9\\s\\-_.,!?()]+$'
    },
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 50,
      default: 10
    }
  })
}

// Validation error types
export interface ValidationError {
  field: string
  message: string
  code: string
  value?: any
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  data?: any
}

// Validation utilities
export const validationUtils = {
  /**
   * Combine multiple validation results
   */
  combineResults: (...results: ValidationResult[]): ValidationResult => {
    const allErrors = results.flatMap(result => result.errors)
    const isValid = allErrors.length === 0
    
    return {
      isValid,
      errors: allErrors,
      data: isValid ? results.map(r => r.data) : undefined
    }
  },

  /**
   * Create validation error
   */
  createError: (field: string, message: string, code: string, value?: any): ValidationError => ({
    field,
    message,
    code,
    value
  }),

  /**
   * Validate required fields
   */
  validateRequired: (data: any, requiredFields: string[]): ValidationError[] => {
    const errors: ValidationError[] = []
    
    for (const field of requiredFields) {
      if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
        errors.push(validationUtils.createError(
          field,
          `${field} is required`,
          'REQUIRED_FIELD_MISSING'
        ))
      }
    }
    
    return errors
  },

  /**
   * Validate field length
   */
  validateLength: (
    value: string,
    field: string,
    min?: number,
    max?: number
  ): ValidationError[] => {
    const errors: ValidationError[] = []
    
    if (min !== undefined && value.length < min) {
      errors.push(validationUtils.createError(
        field,
        `${field} must be at least ${min} characters long`,
        'MIN_LENGTH_VIOLATION',
        value
      ))
    }
    
    if (max !== undefined && value.length > max) {
      errors.push(validationUtils.createError(
        field,
        `${field} cannot exceed ${max} characters`,
        'MAX_LENGTH_VIOLATION',
        value
      ))
    }
    
    return errors
  },

  /**
   * Validate email format
   */
  validateEmail: (email: string, field: string = 'email'): ValidationError[] => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    
    if (!emailRegex.test(email)) {
      return [validationUtils.createError(
        field,
        'Invalid email format',
        'INVALID_EMAIL_FORMAT',
        email
      )]
    }
    
    return []
  },

  /**
   * Validate URL format
   */
  validateUrl: (url: string, field: string = 'url'): ValidationError[] => {
    try {
      new URL(url)
      return []
    } catch {
      return [validationUtils.createError(
        field,
        'Invalid URL format',
        'INVALID_URL_FORMAT',
        url
      )]
    }
  }
}

// Export default validator registry
export default validators
