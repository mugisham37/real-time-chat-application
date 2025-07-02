import Joi from "joi"

export const createGroupSchema = Joi.object({
  name: Joi.string().required().messages({
    "string.base": "Name must be a string",
    "string.empty": "Name is required",
    "any.required": "Name is required",
  }),
  description: Joi.string().allow("", null).messages({
    "string.base": "Description must be a string",
  }),
  members: Joi.array().items(Joi.string()).messages({
    "array.base": "Members must be an array",
    "string.base": "Each member ID must be a string",
  }),
  isPublic: Joi.boolean().default(true).messages({
    "boolean.base": "Is public must be a boolean",
  }),
})
