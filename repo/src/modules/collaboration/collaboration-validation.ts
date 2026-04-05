import { z } from 'zod';

import { AppError } from '../../core/validation/errors';

const contextKeySchema = z.string().trim().min(1).max(160);

export const collaborationMessageSchema = z.object({
  contextKey: contextKeySchema,
  contextLabel: z.string().trim().min(1).max(120),
  messageBody: z.string().trim().min(2).max(4_000),
  source: z.enum(['manual', 'canned']).default('manual')
});

export const collaborationNoteCreateSchema = z.object({
  contextKey: contextKeySchema,
  contextLabel: z.string().trim().min(1).max(120),
  noteBody: z.string().trim().min(2).max(8_000)
});

export const collaborationNoteUpdateSchema = z.object({
  noteId: z.string().trim().min(1),
  noteBody: z.string().trim().min(2).max(8_000)
});

export const collaborationArchiveSchema = z.object({
  recordId: z.string().trim().min(1),
  archived: z.boolean()
});

export const collaborationCannedResponseSchema = z.object({
  title: z.string().trim().min(2).max(140),
  body: z.string().trim().min(2).max(4_000),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([])
});

export const collaborationHistoryQuerySchema = z.object({
  contextKey: contextKeySchema,
  includeArchived: z.boolean().default(false)
});

export const collaborationSearchSchema = z
  .object({
    keyword: z.string().trim().max(120).default(''),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    includeArchived: z.boolean().default(false),
    contextKey: contextKeySchema.optional()
  })
  .refine(
    (input) => {
      if (!input.startDate || !input.endDate) {
        return true;
      }
      return input.startDate <= input.endDate;
    },
    {
      message: 'Start date must be before or equal to end date.',
      path: ['endDate']
    }
  );

export function parseCollaborationPayloadOrThrow<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) {
    return result.data;
  }

  const flattenedFieldErrors = result.error.flatten().fieldErrors;
  const fieldErrors = Object.entries(flattenedFieldErrors).reduce<Record<string, string[]>>(
    (accumulator, [field, value]) => {
      const candidateMessages = Array.isArray(value) ? value : [];
      const messages = candidateMessages.filter(
        (message): message is string => typeof message === 'string' && message.length > 0
      );

      if (messages.length > 0) {
        accumulator[field] = messages;
      }

      return accumulator;
    },
    {}
  );

  throw new AppError({
    code: 'VALIDATION_ERROR',
    message: 'Invalid collaboration payload.',
    fieldErrors
  });
}
