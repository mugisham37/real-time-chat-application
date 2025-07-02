import Joi from "joi"

export const typingStatusSchema = Joi.object({
  conversationId: Joi.string().required().messages({
    "string.base": "Conversation ID must be a string",
    "string.empty": "Conversation ID is required",
    "any.required": "Conversation ID is required",
  }),
  isTyping: Joi.boolean().required().messages({
    "boolean.base": "Is typing must be a boolean",
    "any.required": "Is typing is required",
  }),
})
