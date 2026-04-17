import type { ErrorRequestHandler } from 'express';

interface AppErrorShape {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  details?: Record<string, unknown>;
}

const STATUS_MAP: Record<string, number> = {
  VALIDATION_ERROR: 400,
  PERMISSION_DENIED: 403,
  RECORD_NOT_FOUND: 404,
  CONFLICT: 409,
  DUPLICATE_REQUEST: 409,
  LOCK_UNAVAILABLE: 423,
  SESSION_LOCKED: 401,
  UNKNOWN_ERROR: 500
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const error = err as AppErrorShape;
  const code = error.code ?? 'UNKNOWN_ERROR';
  const status = STATUS_MAP[code] ?? 500;

  res.status(status).json({
    error: {
      code,
      message: error.message ?? 'Internal server error.',
      fieldErrors: error.fieldErrors,
      details: error.details
    }
  });
};
