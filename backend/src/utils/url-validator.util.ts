/**
 * URL Validator for external links in products
 * Part of SDD: docs/project/content-security/sdd/content-security/
 */

// ============================================================================
// ALLOWED EXTERNAL DOMAINS - For products with external links
// ============================================================================

const ALLOWED_VIDEO_DOMAINS = [
  'youtube.com', 'youtu.be',
  'vimeo.com', 'player.vimeo.com',
] as const;

const ALLOWED_STORAGE_DOMAINS = [
  'drive.google.com',
  'dropbox.com',
  'onedrive.live.com',
] as const;

const ALLOWED_DOC_DOMAINS = [
  'docs.google.com',
  'canva.com',
  'notion.so',
] as const;

const ALLOWED_AUDIO_DOMAINS = [
  'soundcloud.com',
  'spotify.com',
] as const;

// All domains combined
const ALL_ALLOWED_DOMAINS = [
  ...ALLOWED_VIDEO_DOMAINS,
  ...ALLOWED_STORAGE_DOMAINS,
  ...ALLOWED_DOC_DOMAINS,
  ...ALLOWED_AUDIO_DOMAINS,
] as const;

// ============================================================================
// PRE-COMPILED DOMAIN PATTERN - More efficient than iterating on every call
// ============================================================================

// Build regex: exact domain OR proper subdomain (not a lookalike suffix)
// Pattern: ^domain$ | ^subdomain\.domain$
// Rejects: evil.com.youtube.com (suffix), fake-spotify.com (different domain)
const DOMAIN_REGEX = new RegExp(
  `^(${ALL_ALLOWED_DOMAINS.map(d => d.replace('.', '\\.')).join('|')})$`,
  'i'
);

const SUBDOMAIN_REGEX = new RegExp(
  `^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+(${ALL_ALLOWED_DOMAINS.map(d => d.replace('.', '\\.')).join('|')})$`,
  'i'
);

// ============================================================================
// TYPES
// ============================================================================

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  normalizedUrl?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates that an external URL belongs to an allowed domain.
 * Used for products with external links (Initial plan).
 */
export function validateExternalUrl(url: string): UrlValidationResult {
  // Parse URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Protocol check - HTTPS only
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS URLs are allowed' };
  }

  // Domain check using pre-compiled regex
  // Valid: youtube.com, video.youtube.com, player.vimeo.com
  // Invalid: evil.com.youtube.com (lookalike suffix), fake-spotify.com (different domain)
  const hostname = parsed.hostname.toLowerCase();
  const isAllowed = DOMAIN_REGEX.test(hostname) || SUBDOMAIN_REGEX.test(hostname);

  if (!isAllowed) {
    return { valid: false, error: 'Domain not allowed' };
  }

  // No auth credentials
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with authentication credentials are not allowed' };
  }

  // No auth tokens in query params (case-insensitive check + decode URI encoding)
  const authParams = ['token', 'key', 'auth', 'access_token', 'api_key', 'signature'];
  const paramKeys = [...parsed.searchParams.keys()].map(k => decodeURIComponent(k).toLowerCase());
  const hasAuthParam = authParams.some(param => paramKeys.includes(param));

  if (hasAuthParam) {
    return { valid: false, error: 'URLs with authentication tokens are not allowed' };
  }

  // Normalize URL: decode for consistency (e.g., %20 -> space)
  const normalized = decodeURIComponent(parsed.toString());

  return { valid: true, normalizedUrl: normalized };
}

/**
 * Safe boolean check for use in Zod schemas
 */
export function validateExternalUrlSafe(value: string): boolean {
  return validateExternalUrl(value).valid;
}

/**
 * Get error message for invalid URL
 */
export function getExternalUrlError(value: string): string {
  return validateExternalUrl(value).error || 'Invalid URL';
}