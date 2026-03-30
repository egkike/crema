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
