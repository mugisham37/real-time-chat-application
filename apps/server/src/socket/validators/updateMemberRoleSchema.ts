import Joi from "joi"

export const updateMemberRoleSchema = Joi.object({
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
  role: Joi.string().valid("admin", "moderator", "member").required().messages({
    "string.base": "Role must be a string",
    "any.only": "Role must be one of: admin, moderator, member",
    "any.required": "Role is required",
  }),
})
