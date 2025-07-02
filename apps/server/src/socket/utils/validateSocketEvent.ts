import type Joi from "joi"
import { logger } from "../../utils/logger"

export const validateSocketEvent = (schema: Joi.ObjectSchema, data: any) => {
  try {
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    })

    if (error) {
      const errors = error.details.map((detail) => ({
        message: detail.message,
        path: detail.path,
      }))

      return {
        success: false,
        errors,
      }
    }

    return {
      success: true,
      value,
    }
  } catch (error) {
    logger.error("Error validating socket event:", error)
    return {
      success: false,
      errors: [{ message: "Validation error" }],
    }
  }
}
