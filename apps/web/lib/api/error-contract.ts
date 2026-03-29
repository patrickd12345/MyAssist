import { NextResponse } from "next/server";
import {
  buildError,
  getOrCreateRequestId,
  toHttpError,
  type CanonicalError,
  type RequestIdSource,
  type ToHttpErrorOptions,
} from "@bookiji-inc/error-contract";

export type MyAssistApiError = CanonicalError;
export type MyAssistLegacyApiError = CanonicalError & { error: string };

export function getApiRequestId(source?: RequestIdSource): string {
  return getOrCreateRequestId(source);
}

export function jsonApiError(
  code: string,
  message: string,
  status: number,
  requestId: string,
  details?: string,
): NextResponse<MyAssistApiError> {
  return NextResponse.json(buildError(code, message, details, requestId), { status });
}

export function jsonLegacyApiError(
  message: string,
  status: number,
  options?: {
    code?: string;
    source?: RequestIdSource;
    details?: string;
    headers?: HeadersInit;
  },
): NextResponse<MyAssistLegacyApiError> {
  const requestId = getOrCreateRequestId(options?.source);
  const code = options?.code || inferErrorCode(status);
  const payload = buildError(code, message, options?.details, requestId);
  return NextResponse.json({ error: message, ...payload }, { status, headers: options?.headers });
}

export function toApiHttpError(error: unknown, options?: ToHttpErrorOptions) {
  return toHttpError(error, options);
}

function inferErrorCode(status: number): string {
  if (status === 400) return "bad_request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "internal_error";
  return "request_failed";
}
