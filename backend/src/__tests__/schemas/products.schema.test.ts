import { describe, it, expect } from 'vitest';

import { validateISBN, DECLARATION_LABELS, createProductSchema } from '../../schemas/products.schema';

describe('products.schema', () => {
  describe('validateISBN', () => {
    describe('ISBN-10 valid', () => {
      it('should accept bare ISBN-10 (0306406152)', () => {
        expect(validateISBN('0306406152')).toBe(true);
      });

      it('should accept ISBN-10 with X as check digit', () => {
        expect(validateISBN('080442957X')).toBe(true);
      });

      it('should accept hyphenated ISBN-10', () => {
        expect(validateISBN('0-306-40615-2')).toBe(true);
      });

      it('should accept ISBN-10 with spaces', () => {
        expect(validateISBN('0 306 40615 2')).toBe(true);
      });

      it('should accept ISBN-10 with ISBN prefix', () => {
        expect(validateISBN('ISBN 0-306-40615-2')).toBe(true);
      });
    });

    describe('ISBN-13 valid', () => {
      it('should accept bare ISBN-13', () => {
        expect(validateISBN('9780306406157')).toBe(true);
      });

      it('should accept hyphenated ISBN-13', () => {
        expect(validateISBN('978-0-306-40615-7')).toBe(true);
      });

      it('should accept ISBN-13 with spaces', () => {
        expect(validateISBN('978 0 306 40615 7')).toBe(true);
      });

      it('should accept ISBN-13 with ISBN-13 prefix', () => {
        expect(validateISBN('ISBN-13: 978-0-306-40615-7')).toBe(true);
      });
    });

    describe('ISBN-10 invalid check digit', () => {
      it('should reject wrong check digit', () => {
        expect(validateISBN('0306406158')).toBe(false); // should be 2
      });

      it('should reject close valid ISBN with bad digit', () => {
        expect(validateISBN('0306406150')).toBe(false);
      });
    });

    describe('ISBN-13 invalid check digit', () => {
      it('should reject wrong check digit', () => {
        expect(validateISBN('9780306406150')).toBe(false); // should be 7
      });

      it('should reject close valid ISBN with bad digit', () => {
        expect(validateISBN('9780306406158')).toBe(false);
      });
    });

    describe('ISBN invalid format', () => {
      it('should reject too short', () => {
        expect(validateISBN('123')).toBe(false);
      });

      it('should reject too long', () => {
        expect(validateISBN('97803064061571234')).toBe(false);
      });

      it('should reject alphanumeric gibberish', () => {
        expect(validateISBN('abcdefghij')).toBe(false);
      });
    });

    describe('ISBN prefix variants', () => {
      it('should accept ISBN-10 prefix variant', () => {
        expect(validateISBN('ISBN-10: 0-306-40615-2')).toBe(true);
      });

      it('should accept lowercase prefix', () => {
        expect(validateISBN('isbn 9780306406157')).toBe(true);
      });
    });
  });

  describe('createProductSchema — declaration fields', () => {
    describe('declarationAccepted', () => {
      it('should accept when declarationAccepted is true', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'course',
          prices: [{ currency: 'ARS', amount: 100 }],
          declarationAccepted: true,
        });

        expect(result.success).toBe(true);
      });

      it('should reject when declarationAccepted is false', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'course',
          prices: [{ currency: 'ARS', amount: 100 }],
          declarationAccepted: false,
        });

        expect(result.success).toBe(false);
      });

      it('should reject when declarationAccepted is missing', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'course',
          prices: [{ currency: 'ARS', amount: 100 }],
        });

        expect(result.success).toBe(false);
      });
    });

    describe('isExternalLinkOnly + externalUrl cross-field', () => {
      it('should accept isExternalLinkOnly with externalUrl', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'link',
          prices: [{ currency: 'ARS', amount: 0 }],
          declarationAccepted: true,
          isExternalLinkOnly: true,
          externalUrl: 'https://youtube.com/watch?v=abc',
        });

        expect(result.success).toBe(true);
      });

      it('should reject isExternalLinkOnly without externalUrl', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'link',
          prices: [{ currency: 'ARS', amount: 0 }],
          declarationAccepted: true,
          isExternalLinkOnly: true,
          // externalUrl missing
        });

        expect(result.success).toBe(false);
      });

      it('should accept isExternalLinkOnly false without externalUrl', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'course',
          prices: [{ currency: 'ARS', amount: 100 }],
          declarationAccepted: true,
          isExternalLinkOnly: false,
        });

        expect(result.success).toBe(true);
      });
    });

    describe('externalUrl — domain validation', () => {
      it('should accept allowed domain youtube.com', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'link',
          prices: [{ currency: 'ARS', amount: 0 }],
          declarationAccepted: true,
          externalUrl: 'https://youtube.com/watch?v=abc',
        });

        expect(result.success).toBe(true);
      });

      it('should accept allowed domain vimeo.com', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'link',
          prices: [{ currency: 'ARS', amount: 0 }],
          declarationAccepted: true,
          externalUrl: 'https://vimeo.com/123456789',
        });

        expect(result.success).toBe(true);
      });

      it('should reject disallowed domain', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'link',
          prices: [{ currency: 'ARS', amount: 0 }],
          declarationAccepted: true,
          externalUrl: 'https://malicious.com/malware.exe',
        });

        expect(result.success).toBe(false);
      });

      it('should reject http:// URL', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'link',
          prices: [{ currency: 'ARS', amount: 0 }],
          declarationAccepted: true,
          externalUrl: 'http://youtube.com/watch?v=abc',
        });

        expect(result.success).toBe(false);
      });
    });

    describe('isbn — format and check digit', () => {
      it('should accept valid ISBN-10', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'ebook',
          prices: [{ currency: 'ARS', amount: 100 }],
          declarationAccepted: true,
          isbn: '0306406152',
        });

        expect(result.success).toBe(true);
      });

      it('should accept valid ISBN-13', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'ebook',
          prices: [{ currency: 'ARS', amount: 100 }],
          declarationAccepted: true,
          isbn: '978-0-306-40615-7',
        });

        expect(result.success).toBe(true);
      });

      it('should accept hyphenated ISBN-10', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'ebook',
          prices: [{ currency: 'ARS', amount: 100 }],
          declarationAccepted: true,
          isbn: '0-306-40615-2',
        });

        expect(result.success).toBe(true);
      });

      it('should reject invalid check digit ISBN-10', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'ebook',
          prices: [{ currency: 'ARS', amount: 100 }],
          declarationAccepted: true,
          isbn: '0306406158', // wrong check digit
        });

        expect(result.success).toBe(false);
      });

      it('should reject invalid check digit ISBN-13', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'ebook',
          prices: [{ currency: 'ARS', amount: 100 }],
          declarationAccepted: true,
          isbn: '9780306406150', // wrong check digit
        });

        expect(result.success).toBe(false);
      });

      it('should accept empty isbn (optional field)', () => {
        const result = createProductSchema.safeParse({
          title: 'Test Product',
          type: 'course',
          prices: [{ currency: 'ARS', amount: 100 }],
          declarationAccepted: true,
        });

        expect(result.success).toBe(true);
      });
    });

    describe('DECLARATION_LABELS', () => {
      it('should export declaration labels for all product types', () => {
        expect(DECLARATION_LABELS.course).toBeTruthy();
        expect(DECLARATION_LABELS.ebook).toBeTruthy();
        expect(DECLARATION_LABELS.podcast).toBeTruthy();
        expect(DECLARATION_LABELS.software).toBeTruthy();
        expect(DECLARATION_LABELS.membership).toBeTruthy();
        expect(DECLARATION_LABELS.link).toBeTruthy();
      });
    });
  });
});
