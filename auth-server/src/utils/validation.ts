/**
 * Shared validation helpers.
 *
 * Single source of truth for resource-id format checks. Each service keeps
 * its own error factory (error codes are per-module API contracts — e.g.
 * `INVALID_UUID` vs `INVALID_RESOURCE_ID`) but shares the pattern and the
 * assertion flow so the rules cannot drift apart.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

export type UuidErrorFactory = (label: string) => Error;

const defaultErrorFactory: UuidErrorFactory = (label: string) =>
  Object.assign(new Error(`Invalid ${label}`), { statusCode: 400, code: 'INVALID_RESOURCE_ID' });

export const assertUuidWith = (
  value: string,
  label: string,
  onError: UuidErrorFactory = defaultErrorFactory,
): void => {
  if (!UUID_PATTERN.test(value)) {
    throw onError(label);
  }
};
