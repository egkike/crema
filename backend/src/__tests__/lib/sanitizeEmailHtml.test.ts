import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger BEFORE the imports that depend on it.
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { AppError } from '../../errors/AppError';
import { sanitizeEmailHtml } from '../../lib/sanitizeEmailHtml';
import { withSanitizedErrors } from '../../lib/withSanitizedErrors';
import logger from '../../utils/logger';

const loggerMock = logger as unknown as { error: ReturnType<typeof vi.fn> };

describe('sanitizeEmailHtml', () => {
  describe('legitimate markup is preserved', () => {
    it('preserves <a href="https://...">link</a>', () => {
      const input = '<a href="https://example.com/path">Retake</a>';
      const out = sanitizeEmailHtml(input);
      expect(out).toContain('<a href="https://example.com/path">');
      expect(out).toContain('Retake');
      expect(out).toContain('</a>');
    });

    it('preserves <b>bold</b>', () => {
      const out = sanitizeEmailHtml('<b>important</b>');
      expect(out).toBe('<b>important</b>');
    });

    it('preserves <ul><li>item</li></ul> structure', () => {
      const input = '<ul><li>one</li><li>two</li></ul>';
      const out = sanitizeEmailHtml(input);
      expect(out).toBe('<ul><li>one</li><li>two</li></ul>');
    });

    it('preserves <h1>title</h1> headings', () => {
      const out = sanitizeEmailHtml('<h1>Welcome</h1>');
      expect(out).toBe('<h1>Welcome</h1>');
    });

    it('preserves <p>, <em>, <strong>, <br>, <blockquote>', () => {
      const input = '<p>Hello <em>there</em> <strong>friend</strong><br/>--</p><blockquote>hi</blockquote>';
      const out = sanitizeEmailHtml(input);
      expect(out).toContain('<p>');
      expect(out).toContain('<em>there</em>');
      expect(out).toContain('<strong>friend</strong>');
      expect(out).toContain('<br');
      expect(out).toContain('<blockquote>hi</blockquote>');
    });

    it('preserves mailto: scheme on <a>', () => {
      const out = sanitizeEmailHtml('<a href="mailto:hi@example.com">email me</a>');
      expect(out).toContain('href="mailto:hi@example.com"');
    });

    it('returns empty string for falsy input', () => {
      expect(sanitizeEmailHtml('')).toBe('');
    });
  });

  describe('XSS vectors are stripped', () => {
    it('strips Unicode-encoded javascript: URI in an href', () => {
      // &#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116; decodes to "javascript"
      const input =
        '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)">click</a>';
      const out = sanitizeEmailHtml(input);
      // The dangerous scheme is removed; the tag content and tag itself stay (or the
      // href is dropped — both are acceptable, but javascript: must not survive).
      expect(out.toLowerCase()).not.toContain('javascript:');
      expect(out.toLowerCase()).not.toContain('alert(1)');
    });

    it('strips inline <script> tags', () => {
      const input = '<p>safe</p><script>alert(1)</script><p>after</p>';
      const out = sanitizeEmailHtml(input);
      expect(out).not.toContain('<script');
      expect(out).not.toContain('alert(1)');
      expect(out).toContain('<p>safe</p>');
      expect(out).toContain('<p>after</p>');
    });

    it('strips <svg> with onload handler (active content)', () => {
      const input = '<svg onload=alert(1)></svg><p>safe</p>';
      const out = sanitizeEmailHtml(input);
      expect(out).not.toContain('<svg');
      expect(out).not.toContain('onload');
      expect(out).not.toContain('alert(1)');
    });

    it('strips attribute-based XSS via javascript: scheme on an anchor', () => {
      const input = '<a href="javascript:alert(1)">click</a>';
      const out = sanitizeEmailHtml(input);
      expect(out.toLowerCase()).not.toContain('javascript:');
      expect(out).not.toContain('alert(1)');
      // Tag content survives; the href is removed/blocked.
      expect(out).toContain('click');
    });

    it('neutralizes tab/newline splitting inside <script> tag name (no real <script> tag survives)', () => {
      // The tab and newline inside the tag name make this NOT a valid <script>
      // tag — a real HTML parser will see it as text, not as a script element.
      // The sanitizer must NOT produce a <script> element from this input,
      // because if it did, alert(1) would execute.
      const input = '<scr\tipt>alert(1)</scr\nipt>';
      const out = sanitizeEmailHtml(input);
      // No real <script> tag survives (case-insensitive, with space or > after the name)
      expect(out.toLowerCase()).not.toMatch(/<script[\s>]/);
      expect(out.toLowerCase()).not.toMatch(/<\/script\s*>/);
    });

    it('strips on* event handlers from allowed tags', () => {
      const input = '<p onclick="alert(1)">hello</p><a href="https://x.com" onmouseover="alert(2)">x</a>';
      const out = sanitizeEmailHtml(input);
      expect(out).not.toContain('onclick');
      expect(out).not.toContain('onmouseover');
      expect(out).not.toContain('alert');
    });

    it('strips <iframe> tags', () => {
      const input = '<p>safe</p><iframe src="https://evil.com"></iframe><p>after</p>';
      const out = sanitizeEmailHtml(input);
      expect(out).not.toContain('<iframe');
      expect(out).toContain('<p>safe</p>');
    });
  });
});

describe('withSanitizedErrors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the resolved value when fn resolves', async () => {
    const result = await withSanitizedErrors('op.test', 'user-1', async () => 42);
    expect(result).toBe(42);
  });

  it('re-throws AppError unchanged (passes through 4xx)', async () => {
    const appErr = new AppError('Not found', 404);
    const err = await withSanitizedErrors('op.test', 'user-1', () => Promise.reject(appErr)).catch(
      (e) => e,
    );
    expect(err).toBe(appErr);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(404);
    // Generic 500 should NOT be thrown when the original error was an AppError.
    expect((err as AppError).message).toBe('Not found');
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('replaces a raw Error with a generic AppError(500)', async () => {
    const rawErr = new Error('violates foreign key constraint "orders_product_id_fkey"');
    const err = await withSanitizedErrors(
      'op.test',
      'user-1',
      () => Promise.reject(rawErr),
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(500);
    expect((err as AppError).message).toBe('Error al ejecutar la consulta');
    // The original constraint name must NOT leak to the client.
    expect((err as AppError).message).not.toContain('orders_product_id_fkey');
  });

  it('logs the full original error detail server-side', async () => {
    const rawErr = new Error('connection terminated unexpectedly (pg pool exhausted)');
    await withSanitizedErrors(
      'predictChurn.studentQuery',
      'user-abc',
      () => Promise.reject(rawErr),
    ).catch(() => {
      /* expected */
    });

    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    const [logArg, logMsg] = loggerMock.error.mock.calls[0];
    // Log must include the operation label and user id for traceability.
    expect(logArg).toMatchObject({ op: 'predictChurn.studentQuery', userId: 'user-abc' });
    // The full original message is preserved in the log (this is the WHOLE POINT).
    expect(logArg.err).toContain('connection terminated unexpectedly');
    expect(logArg.err).toContain('pg pool exhausted');
    expect(logMsg).toBe('DB error — sanitized for client');
  });

  it('handles non-Error rejections (strings, objects) safely', async () => {
    const err1 = await withSanitizedErrors('op.test', undefined, () =>
      Promise.reject('a string error'),
    ).catch((e) => e);
    expect(err1).toBeInstanceOf(AppError);
    expect((err1 as AppError).message).toBe('Error al ejecutar la consulta');

    const err2 = await withSanitizedErrors('op.test', undefined, () =>
      Promise.reject({ code: 42 }),
    ).catch((e) => e);
    expect(err2).toBeInstanceOf(AppError);
    expect((err2 as AppError).message).toBe('Error al ejecutar la consulta');
  });

  it('works when userId is undefined (e.g. unauthenticated path)', async () => {
    const rawErr = new Error('database is on fire');
    const err = await withSanitizedErrors(
      'op.test',
      undefined,
      () => Promise.reject(rawErr),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'op.test', userId: undefined }),
      expect.any(String),
    );
  });
});
