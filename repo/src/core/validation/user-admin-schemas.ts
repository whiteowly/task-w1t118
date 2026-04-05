import { z } from 'zod';

import { ROLE_NAMES } from '../../shared/types/auth';
import { AppError } from './errors';

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(32, 'Username must be at most 32 characters.')
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'Username may only include letters, numbers, dot, underscore, or dash.'
  );

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.');

const roleSchema = z.enum(ROLE_NAMES);

export const createLocalUserSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    roles: z.array(roleSchema).min(1, 'Select at least one role.')
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Password confirmation does not match.'
      });
    }
  });

export const updateLocalUserRolesSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  roles: z.array(roleSchema).min(1, 'Select at least one role.')
});

export const updateLocalUserStatusSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  status: z.enum(['active', 'disabled'])
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

export function parseAdminSchemaOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed.',
      fieldErrors: zodErrorToFieldErrors(result.error)
    });
  }

  return result.data;
}
