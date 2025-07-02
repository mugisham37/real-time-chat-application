import Joi from "joi"

export const presenceStatusSchema = Joi.object({
  status: Joi.string().valid("online", "offline", "away", "busy").required().messages({
    "string.base": "Status must be a string",
    "any.only": "Status must be one of: online, offline, away, busy",
    "any.required": "Status is required",
  }),
  customStatus: Joi.string().allow("", null).messages({
    "string.base": "Custom status must be a string",
  }),
})
