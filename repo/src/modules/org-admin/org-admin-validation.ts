import { z } from 'zod';

import type { OrgHierarchyNodeType } from '../../core/db/database';
import { AppError } from '../../core/validation/errors';

const hierarchyNodeTypeSchema = z.enum(['organization', 'department', 'grade', 'class']);

const textItemSchema = z.string().trim().min(2).max(140);

export const createHierarchyNodeSchema = z.object({
  name: textItemSchema,
  nodeType: hierarchyNodeTypeSchema,
  parentId: z.string().trim().min(1).nullable()
});

const uniqueStringArraySchema = z
  .array(textItemSchema)
  .min(1, 'Provide at least one entry.')
  .transform((items) => Array.from(new Set(items.map((item) => item.trim()))));

export const createPositionDefinitionSchema = z.object({
  title: textItemSchema,
  departmentNodeId: z.string().trim().min(1),
  gradeNodeId: z.string().trim().min(1),
  classNodeId: z.string().trim().min(1),
  responsibilities: uniqueStringArraySchema,
  eligibilityRules: uniqueStringArraySchema,
  headcountLimit: z.number().int().min(1).max(500)
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

export function parseOrgAdminPayloadOrThrow<T>(schema: z.ZodSchema<T>, payload: unknown): T {
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

export function expectedParentNodeType(
  nodeType: OrgHierarchyNodeType
): OrgHierarchyNodeType | null {
  if (nodeType === 'organization') return null;
  if (nodeType === 'department') return 'organization';
  if (nodeType === 'grade') return 'department';
  return 'grade';
}
