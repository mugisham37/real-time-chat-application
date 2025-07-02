import Joi from "joi"

export const addMemberSchema = Joi.object({
  groupId: Joi.string().required().messages({
    "string.base": "Group ID must be a string",
    "string.empty": "Group ID is required",
    "any.required": "Group ID is required",
  }),
  memberId: Joi.string().required().messages({
    "string.base": "Member ID must be a string",
    "string.empty": "Member ID is required",
    "any.required": "Member ID is required",
  }),
})
