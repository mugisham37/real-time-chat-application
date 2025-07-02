import { z } from 'zod';

export const callAnswerSchema = z.object({
  callId: z.string().min(1, "Call ID is required"),
  accepted: z.boolean({
    required_error: "Accepted is required",
    invalid_type_error: "Accepted must be a boolean"
  }),
  sdp: z.object({
    type: z.string(),
    sdp: z.string()
  }).optional()
}).refine((data) => {
  // If accepted is true, sdp is required
  if (data.accepted === true && !data.sdp) {
    return false;
  }
  return true;
}, {
  message: "SDP is required when call is accepted",
  path: ["sdp"]
});

export type CallAnswerData = z.infer<typeof callAnswerSchema>;
