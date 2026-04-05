import { z } from 'zod';

import type { NormalizedError } from '../../shared/types/errors';
import { AppError } from '../../core/validation/errors';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  AMENITY_OPTIONS,
  MAX_IMAGE_SIZE_BYTES,
  MERCHANT_TAG_OPTIONS
} from './merchant-config';

const merchantTextSchema = z.string().trim().min(1).max(120);
const optionalDescriptionSchema = z.string().trim().max(800);

const tagSchema = z.enum(MERCHANT_TAG_OPTIONS);
const amenitySchema = z.enum(AMENITY_OPTIONS);

export const createMerchantSchema = z.object({
  name: merchantTextSchema,
  description: optionalDescriptionSchema.default(''),
  tags: z.array(tagSchema).default([]),
  amenities: z.array(amenitySchema).default([])
});

export const updateMerchantDraftSchema = z.object({
  merchantId: z.string().min(1),
  expectedVersionNo: z.number().int().positive(),
  name: merchantTextSchema,
  description: optionalDescriptionSchema.default(''),
  tags: z.array(tagSchema),
  amenities: z.array(amenitySchema),
  imageAssetId: z.string().nullable()
});

export const createStoreSchema = z.object({
  merchantId: z.string().min(1),
  name: merchantTextSchema,
  description: optionalDescriptionSchema.default(''),
  tags: z.array(tagSchema).default([]),
  amenities: z.array(amenitySchema).default([]),
  imageAssetId: z.string().nullable().default(null)
});

export const updateStoreSchema = z.object({
  storeId: z.string().min(1),
  name: merchantTextSchema,
  description: optionalDescriptionSchema.default(''),
  tags: z.array(tagSchema).default([]),
  amenities: z.array(amenitySchema).default([]),
  imageAssetId: z.string().nullable().default(null)
});

export const createMenuSchema = z.object({
  storeId: z.string().min(1),
  name: merchantTextSchema,
  description: optionalDescriptionSchema.default('')
});

export const updateMenuSchema = z.object({
  menuId: z.string().min(1),
  name: merchantTextSchema,
  description: optionalDescriptionSchema.default('')
});

export const createComboSchema = z.object({
  menuId: z.string().min(1),
  name: merchantTextSchema,
  description: optionalDescriptionSchema.default(''),
  priceLabel: z.string().trim().min(1).max(40)
});

export const updateComboSchema = z.object({
  comboId: z.string().min(1),
  name: merchantTextSchema,
  description: optionalDescriptionSchema.default(''),
  priceLabel: z.string().trim().min(1).max(40)
});

export const workflowTransitionSchema = z.object({
  merchantId: z.string().min(1),
  reason: z.string().trim().max(500).optional()
});

function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path[0]?.toString() ?? 'form';
    fieldErrors[key] = fieldErrors[key] ?? [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}

export function parseMerchantPayloadOrThrow<T>(schema: z.ZodSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed.',
      fieldErrors: zodFieldErrors(parsed.error)
    });
  }
  return parsed.data;
}

export interface ValidatedImageFile {
  file: File;
  mimeType: string;
  sizeBytes: number;
}

export function validateMerchantImageFile(file: File): ValidatedImageFile {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Only JPEG and PNG images are allowed.',
      fieldErrors: { image: ['Only JPEG and PNG images are allowed.'] }
    });
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Image size must be 5 MB or less.',
      fieldErrors: { image: ['Image size must be 5 MB or less.'] }
    });
  }

  return {
    file,
    mimeType: file.type,
    sizeBytes: file.size
  };
}

export function normalizeMerchantError(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
      retryable: error.retryable,
      details: error.details
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : 'Unexpected merchant error.'
  };
}
