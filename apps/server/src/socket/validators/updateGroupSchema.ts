import Joi from "joi"

export const updateGroupSchema = Joi.object({
  groupId: Joi.string().required().messages({
    "string.base": "Group ID must be a string",
    "string.empty": "Group ID is required",
    "any.required": "Group ID is required",
  }),
  name: Joi.string().messages({
    "string.base": "Name must be a string",
  }),
  description: Joi.string().allow("", null).messages({
    "string.base": "Description must be a string",
  }),
  avatar: Joi.string().uri().allow("", null).messages({
    "string.base": "Avatar must be a string",
    "string.uri": "Avatar must be a valid URI",
  }),
  isPublic: Joi.boolean().messages({
    "boolean.base": "Is public must be a boolean",
  }),
  settings: Joi.object({
    whoCanSend: Joi.string().valid("all", "admins"),
    whoCanAddMembers: Joi.string().valid("all", "admins"),
  }).messages({
    "object.base": "Settings must be an object",
  }),
})
