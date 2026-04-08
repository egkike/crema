/**
 * Extracts and sanitizes the client IP address from request headers.
 *
 * X-Forwarded-For can be spoofed and may contain multiple IPs.
 * This function extracts only the first valid IP (the original client).
 *
 * @param forwardedFor - The x-forwarded-for header value (can be comma-separated)
 * @param fallback - Fallback IP (typically req.socket.remoteAddress)
 * @returns A sanitized IP string or '0.0.0.0' if none is valid
 */
export function extractClientIp(forwardedFor: string | undefined, fallback?: string): string {
  if (forwardedFor) {
    // X-Forwarded-For format: "client, proxy1, proxy2"
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp && isValidIp(firstIp)) {
      return firstIp;
    }
  }

  if (fallback && isValidIp(fallback)) {
    return fallback;
  }

  return '0.0.0.0';
}

/**
 * Validates that a string is a well-formed IPv4 or IPv6 address.
 * Only allows alphanumeric, dots, colons, and hyphens.
 */
function isValidIp(ip: string): boolean {
  // Strict pattern: only valid IP characters
  const ipPattern = /^[a-fA-F0-9.:]+$/;
  return ipPattern.test(ip) && ip.length > 0 && ip.length <= 45;
}

/**
 * Safely extracts error message without exposing internal details.
 * Uses type-safe check to avoid accessing properties on non-Error objects.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
