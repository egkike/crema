/**
 * Utility functions for parameter handling
 */

/**
 * Convert express parameter to string (handles string | string[])
 */
export function toString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0];
  return value || '';
}

/**
 * Parse and clamp a numeric query parameter to safe bounds.
 * Prevents DoS via excessively large values.
 */
export function parseClamped(
  value: string | string[] | undefined,
  defaultValue: number,
  min: number,
  max: number
): number {
  const parsed = parseInt(toString(value), 10);
  if (Number.isNaN(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Parse a date query parameter safely.
 * Returns undefined for invalid dates.
 */
export function parseDate(value: string | string[] | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(toString(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}
