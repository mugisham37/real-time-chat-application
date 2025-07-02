import Joi from "joi"

export const messageReactionSchema = Joi.object({
  messageId: Joi.string().required().messages({
    "string.base": "Message ID must be a string",
    "string.empty": "Message ID is required",
    "any.required": "Message ID is required",
  }),
  reactionType: Joi.string().required().messages({
    "string.base": "Reaction type must be a string",
    "string.empty": "Reaction type is required",
    "any.required": "Reaction type is required",
  }),
})
