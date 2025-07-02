import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string({
    required_error: "Name is required",
    invalid_type_error: "Name must be a string"
  }).min(1, "Name is required"),
  description: z.string({
    invalid_type_error: "Description must be a string"
  }).optional().nullable(),
  members: z.array(z.string({
    invalid_type_error: "Each member ID must be a string"
  }), {
    invalid_type_error: "Members must be an array"
  }).optional(),
  isPublic: z.boolean({
    invalid_type_error: "Is public must be a boolean"
  }).default(true)
});

export type CreateGroupData = z.infer<typeof createGroupSchema>;
