import { z } from 'zod';

import { AppError } from '../../core/validation/errors';

const trimmedText = z.string().trim().min(1).max(160);

export const createOfferFromTemplateSchema = z.object({
  templateId: z.string().trim().min(1),
  candidateName: trimmedText,
  candidateEmail: z.string().trim().email('Enter a valid email address.')
});

export const offerDecisionSchema = z.object({
  offerId: z.string().trim().min(1),
  reason: z.string().trim().max(500).optional()
});

export const signatureCaptureSchema = z.object({
  offerId: z.string().trim().min(1),
  typedSignerName: trimmedText,
  drawnSignatureDataUrl: z
    .string()
    .trim()
    .max(2_000_000)
    .optional()
    .refine(
      (value) => value === undefined || value.length === 0 || value.startsWith('data:image/'),
      'Drawn signature must be an image data URL.'
    )
});

export const onboardingDocumentSchema = z.object({
  offerId: z.string().trim().min(1),
  legalName: trimmedText,
  addressLine1: z.string().trim().min(3).max(240),
  city: z.string().trim().min(2).max(120),
  stateProvince: z.string().trim().min(2).max(60),
  postalCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{3,12}$/, 'Postal code format is invalid.'),
  ssn: z
    .string()
    .trim()
    .regex(/^\d{3}-\d{2}-\d{4}$/, 'SSN must use format ###-##-####.'),
  emergencyContactName: trimmedText,
  emergencyContactPhone: z
    .string()
    .trim()
    .regex(/^[0-9+() -]{7,24}$/, 'Emergency contact phone format is invalid.')
});

export const checklistItemStatusSchema = z.object({
  offerId: z.string().trim().min(1),
  checklistItemId: z.string().trim().min(1),
  status: z.enum(['not_started', 'in_progress', 'complete'])
});

export const listChecklistSchema = z.object({
  offerId: z.string().trim().min(1)
});

function zodErrorToFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path[0]?.toString() ?? 'form';
    fieldErrors[key] = fieldErrors[key] ?? [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}

export function parseRecruitingPayloadOrThrow<T>(schema: z.ZodSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed.',
      fieldErrors: zodErrorToFieldErrors(parsed.error)
    });
  }
  return parsed.data;
}
