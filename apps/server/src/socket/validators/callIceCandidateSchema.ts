import { z } from 'zod';

export const callIceCandidateSchema = z.object({
  callId: z.string().min(1, "Call ID is required"),
  candidate: z.object({
    candidate: z.string(),
    sdpMLineIndex: z.number().nullable(),
    sdpMid: z.string().nullable(),
    usernameFragment: z.string().nullable().optional()
  }),
  userId: z.string().min(1, "User ID is required").optional()
});

export type CallIceCandidateData = z.infer<typeof callIceCandidateSchema>;
