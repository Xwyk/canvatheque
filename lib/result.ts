export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

export type ActionError = {
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
  retryAfter?: number;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const fail = (
  code: ErrorCode,
  message: string,
  extra: Omit<ActionError, "code" | "message"> = {},
): Result<never> => ({ ok: false, error: { code, message, ...extra } });

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export const httpStatusFor = (code: ErrorCode): number => HTTP_STATUS[code];
