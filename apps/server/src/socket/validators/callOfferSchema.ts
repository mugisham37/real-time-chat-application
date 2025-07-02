import Joi from "joi"

export const callOfferSchema = Joi.object({
  recipientId: Joi.string().required().messages({
    "string.base": "Recipient ID must be a string",
    "string.empty": "Recipient ID is required",
    "any.required": "Recipient ID is required",
  }),
  sdp: Joi.object().required().messages({
    "object.base": "SDP must be an object",
    "any.required": "SDP is required",
  }),
  callType: Joi.string().valid("audio", "video").required().messages({
    "string.base": "Call type must be a string",
    "string.empty": "Call type is required",
    "string.valid": "Call type must be either 'audio' or 'video'",
    "any.required": "Call type is required",
  }),
})
