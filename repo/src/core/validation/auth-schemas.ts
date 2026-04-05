import { z } from 'zod';

import { AppError } from './errors';

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(32, 'Username must be at most 32 characters.');

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.');

export const bootstrapAdminSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string()
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

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Password is required.')
});

export const reauthSchema = z.object({
  password: z.string().min(1, 'Password is required.')
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

export function parseOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
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
