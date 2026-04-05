export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'PERMISSION_DENIED'
  | 'RECORD_NOT_FOUND'
  | 'CONFLICT'
  | 'DUPLICATE_REQUEST'
  | 'LOCK_UNAVAILABLE'
  | 'UNSUPPORTED_BROWSER'
  | 'STORAGE_UNAVAILABLE'
  | 'SESSION_LOCKED'
  | 'UNKNOWN_ERROR';

export interface NormalizedError {
  code: AppErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
  retryable?: boolean;
  details?: Record<string, unknown>;
}
