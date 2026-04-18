import type { AppErrorCode, NormalizedError } from '../../shared/types/errors';

export class AppError extends Error {
  code: AppErrorCode;
  fieldErrors?: Record<string, string[]>;
  retryable?: boolean;
  details?: Record<string, unknown>;

  constructor(error: NormalizedError) {
    super(error.message);
    this.code = error.code;
    this.fieldErrors = error.fieldErrors;
    this.retryable = error.retryable;
    this.details = error.details;
  }
}

export function normalizeUnknownError(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
      retryable: error.retryable,
      details: error.details
    };
  }

  if (error instanceof Error) {
    const unknownError = error as Error & {
      code?: AppErrorCode;
      fieldErrors?: Record<string, string[]>;
      retryable?: boolean;
      details?: Record<string, unknown>;
    };

    return {
      code: unknownError.code ?? 'UNKNOWN_ERROR',
      message: error.message,
      fieldErrors: unknownError.fieldErrors,
      retryable: unknownError.retryable,
      details: unknownError.details
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'Unexpected error occurred.'
  };
}
