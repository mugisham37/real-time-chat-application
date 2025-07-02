import { z } from 'zod'
import { logger } from '../../utils/logger'

export interface ValidationResult<T = any> {
  success: boolean
  value?: T
  errors?: Array<{
    message: string
    path: string[]
    code: string
  }>
}

/**
 * Validates socket event data using Zod schemas
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns ValidationResult with success status and either validated data or errors
 */
export const validateZodEvent = <T>(
  schema: z.ZodSchema<T>,
  data: any
): ValidationResult<T> => {
  try {
    const result = schema.safeParse(data)

    if (!result.success) {
      const errors = result.error.errors.map((error) => ({
        message: error.message,
        path: error.path.map(p => String(p)),
        code: error.code
      }))

      return {
        success: false,
        errors
      }
    }

    return {
      success: true,
      value: result.data
    }
  } catch (error) {
    logger.error('Error validating socket event with Zod:', error)
    return {
      success: false,
      errors: [{
        message: 'Validation error occurred',
        path: [],
        code: 'custom'
      }]
    }
  }
}

/**
 * Type guard to check if validation was successful
 */
export const isValidationSuccess = <T>(
  result: ValidationResult<T>
): result is ValidationResult<T> & { success: true; value: T } => {
  return result.success === true
}

/**
 * Decorator for socket handlers that automatically validates data
 */
export function ValidateZodData<T>(schema: z.ZodSchema<T>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = function (socket: any, data: any, callback?: Function) {
      const validationResult = validateZodEvent(schema, data)

      if (!validationResult.success) {
        if (callback) {
          callback({
            success: false,
            message: 'Validation error',
            errors: validationResult.errors
          })
        }
        return
      }

      return originalMethod.call(this, socket, validationResult.value, callback)
    }

    return descriptor
  }
}
