/**
 * Utility functions for parameter handling
 */
import type { ParsedQs } from 'qs';

/**
 * Convert express parameter to string (handles string | string[])
 */
export function toString(value: string | string[] | ParsedQs | (string | ParsedQs)[] | undefined): string {
  if (Array.isArray(value)) return toString(value[0]);
  if (typeof value === 'object' && value !== null) return '';
  return (value as string) || '';
}

/**
 * Parse and clamp a numeric query parameter to safe bounds.
 * Prevents DoS via excessively large values.
 */
export function parseClamped(
  value: string | string[] | ParsedQs | (string | ParsedQs)[] | undefined,
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
export function parseDate(value: string | string[] | ParsedQs | (string | ParsedQs)[] | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(toString(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}
