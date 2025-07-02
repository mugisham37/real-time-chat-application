import { z } from 'zod';

export const messageEventSchema = z.object({
  conversationId: z.string({
    required_error: "Conversation ID is required",
    invalid_type_error: "Conversation ID must be a string"
    "any.required": "Conversation ID is required",
  }),
  content: Joi.string().required().messages({
    "string.base": "Content must be a string",
    "string.empty": "Content is required",
    "any.required": "Content is required",
  }),
  contentType: Joi.string().valid("text", "image", "video", "file", "audio").default("text").messages({
    "string.base": "Content type must be a string",
    "any.only": "Content type must be one of: text, image, video, file, audio",
  }),
  mediaUrl: Joi.string()
    .uri()
    .when("contentType", {
      is: Joi.valid("image", "video", "file", "audio"),
      then: Joi.required(),
      otherwise: Joi.optional(),
    })
    .messages({
      "string.base": "Media URL must be a string",
      "string.uri": "Media URL must be a valid URI",
      "any.required": "Media URL is required for this content type",
    }),
  mediaDetails: Joi.object({
    fileName: Joi.string(),
    fileSize: Joi.number(),
    mimeType: Joi.string(),
    dimensions: Joi.object({
      width: Joi.number(),
      height: Joi.number(),
    }),
  })
    .when("contentType", {
      is: Joi.valid("image", "video", "file", "audio"),
      then: Joi.required(),
      otherwise: Joi.optional(),
    })
    .messages({
      "object.base": "Media details must be an object",
      "any.required": "Media details are required for this content type",
    }),
  replyTo: Joi.string().allow(null, "").messages({
    "string.base": "Reply to must be a string",
  }),
  mentions: Joi.array().items(Joi.string()).messages({
    "array.base": "Mentions must be an array",
    "string.base": "Each mention must be a string",
  }),
})
