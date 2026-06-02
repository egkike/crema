/**
 * Email-friendly HTML sanitizer.
 *
 * Wraps the battle-tested `sanitize-html` library with an allowlist tuned for
 * transactional/recovery emails: the same tags an email-rendering frontend
 * emits, and only `https` / `mailto` schemes. Strips XSS vectors the
 * hand-rolled sanitizer missed (Unicode escapes, SVG with active content,
 * attribute-based XSS, tab/newline splitting inside tag names).
 *
 * Server-side, pure-JS, no native deps — see
 * docs/project/ai-features/sdd/fix-agents-service-gga-findings/design.md §2.1.
 */
import sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'a',
    'b',
    'i',
    'em',
    'strong',
    'p',
    'br',
    'h1',
    'h2',
    'h3',
    'ul',
    'ol',
    'li',
    'blockquote',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  // Only safe URL schemes — blocks `javascript:`, `data:`, `vbscript:`, etc.
  allowedSchemes: ['https', 'mailto'],
  allowedSchemesByTag: {
    a: ['https', 'mailto'],
  },
  // Apply scheme allowlist to all URI-bearing attributes (href, src, ...).
  allowedSchemesAppliedToAttributes: ['href'],
  enforceHtmlBoundary: true,
};

/**
 * Sanitizes an HTML string for safe rendering in an email body.
 *
 * @param html - Raw HTML (typically LLM-generated)
 * @returns Sanitized HTML with only the allowlisted tags/attributes/schemes.
 *          Returns an empty string for falsy input.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}
