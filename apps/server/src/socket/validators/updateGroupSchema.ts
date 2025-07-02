import { z } from 'zod';

export const updateGroupSchema = z.object({
  groupId: z.string({
    required_error: "Group ID is required",
    invalid_type_error: "Group ID must be a string"
  }).min(1, "Group ID is required"),
  name: z.string({
    invalid_type_error: "Name must be a string"
  }).optional(),
  description: z.string({
    invalid_type_error: "Description must be a string"
  }).optional().nullable(),
  avatar: z.string({
    invalid_type_error: "Avatar must be a string"
  }).url("Avatar must be a valid URL").optional().nullable(),
  isPublic: z.boolean({
    invalid_type_error: "Is public must be a boolean"
  }).optional(),
  settings: z.object({
    whoCanSend: z.enum(["all", "admins"]),
    whoCanAddMembers: z.enum(["all", "admins"])
  }, {
    invalid_type_error: "Settings must be an object"
  }).optional()
});

export type UpdateGroupData = z.infer<typeof updateGroupSchema>;
