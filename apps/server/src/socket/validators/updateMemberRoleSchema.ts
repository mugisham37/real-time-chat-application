import { z } from 'zod';

export const updateMemberRoleSchema = z.object({
  groupId: z.string({
    required_error: "Group ID is required",
    invalid_type_error: "Group ID must be a string"
  }).min(1, "Group ID is required"),
  memberId: z.string({
    required_error: "Member ID is required",
    invalid_type_error: "Member ID must be a string"
  }).min(1, "Member ID is required"),
  role: z.enum(['admin', 'moderator', 'member'], {
    required_error: "Role is required",
    invalid_type_error: "Role must be one of: admin, moderator, member"
  }),
  updatedBy: z.string({
    required_error: "Updated by user ID is required",
    invalid_type_error: "Updated by user ID must be a string"
  }).min(1, "Updated by user ID is required").optional()
});

export type UpdateMemberRoleData = z.infer<typeof updateMemberRoleSchema>;
