import { z } from 'zod';

export const CallTypeEnum = z.enum(['Automated', 'Escalated']);
export type CallType = z.infer<typeof CallTypeEnum>;

export const SuccessCategoryEnum = z.enum([
  'Successful',
  'Partially Successful',
  'Unsuccessful'
]);
export type SuccessCategory = z.infer<typeof SuccessCategoryEnum>;

export const Step1Schema = z.object({
  callType: CallTypeEnum,
  successCategory: SuccessCategoryEnum,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1)
}).superRefine((val, ctx) => {
  if (val.callType === 'Automated' && val.successCategory === 'Partially Successful') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Automated calls cannot be Partially Successful.'
    });
  }
  if (val.callType === 'Escalated' && val.successCategory === 'Successful') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Escalated calls cannot be marked Successful; choose Partially Successful or Unsuccessful.'
    });
  }
});

export const Step2Schema = z.object({
  intent: z.string().min(1),
  intentCategory: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1)
});

export const Step3Schema = z.object({
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1),
  actionItems: z.array(z.string().min(1)).default([])
});

export const FinalSchema = z.object({
  callType: CallTypeEnum,
  successCategory: SuccessCategoryEnum,
  intent: z.string().min(1),
  intentCategory: z.string().min(1),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1),
  actionItems: z.array(z.string().min(1)).default([]),
  escalationReason: z.string().optional(),
  products: z.array(z.object({ id: z.string(), name: z.string(), score: z.number().min(0).max(1) })).default([]),
  keywords: z.array(z.object({ term: z.string(), score: z.number().min(0).max(1) })).default([]),
  relatedDocs: z.array(z.object({ id: z.string(), score: z.number(), metadata: z.record(z.string(), z.any()).optional() })).default([]),
  pineconeRecordId: z.string().optional()
}).superRefine((val, ctx) => {
  if (val.callType === 'Automated' && val.successCategory === 'Partially Successful') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Automated calls: only Successful or Unsuccessful.' });
  }
  if (val.callType === 'Escalated' && val.successCategory === 'Successful') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Escalated calls: only Partially Successful or Unsuccessful.' });
  }
});

export type FinalAnalysis = z.infer<typeof FinalSchema>;
