import Joi from "joi"

export const messageEditSchema = Joi.object({
  messageId: Joi.string().required().messages({
    "string.base": "Message ID must be a string",
    "string.empty": "Message ID is required",
    "any.required": "Message ID is required",
  }),
  content: Joi.string().required().messages({
    "string.base": "Content must be a string",
    "string.empty": "Content is required",
    "any.required": "Content is required",
  }),
})
