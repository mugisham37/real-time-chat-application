import { z } from 'zod';

export const addMemberSchema = z.object({
  groupId: z.string({
    required_error: "Group ID is required",
    invalid_type_error: "Group ID must be a string"
  }).min(1, "Group ID is required"),
  memberId: z.string({
    required_error: "Member ID is required",
    invalid_type_error: "Member ID must be a string"
  }).min(1, "Member ID is required"),
  role: z.enum(['member', 'admin']).default('member').optional()
});

export type AddMemberData = z.infer<typeof addMemberSchema>;
