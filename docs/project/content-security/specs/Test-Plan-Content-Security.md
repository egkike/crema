# Test Plan + Test Cases
## Crema - Content Security & Upload Validation

**Versión**: 1.0  
**Fecha**: Abril 2026  
**Change**: content-security  
**Estado**: Draft

---

## 1. Estrategia de Testing

### 1.1 Tipos de Tests

| Tipo | Cobertura | Herramienta |
|------|-----------|-------------|
| Unit Tests | Servicios y middlewares individuales | Vitest |
| Integration | Endpoints de upload, validación | Vitest + Supertest |
| Security | Validaciones de seguridad | Vitest + mocks |
| Manual | Edge cases complejos | - |

### 1.2 Ambiente de Testing

| Ambiente | DB | Notas |
|----------|-----|-----|
| Local | PostgreSQL (docker) | Con datos mock |
| CI | PostgreSQL container | Tests automatizados |

---

## 2. Unit Tests

### 2.1 Upload Middleware

#### TC-01: Allowlist de extensiones - extensiones válidas
```typescript
describe('UploadMiddleware', () => {
  it('should accept valid extensions', async () => {
    // GIVEN: File with valid extension .pdf
    const file = { name: 'ebook.pdf', mimeType: 'application/pdf' };
    
    // WHEN: Validating
    const result = await uploadMiddleware.validateExtension(file);
    
    // THEN: Returns valid
    expect(result.isValid).toBe(true);
  });
});
```

#### TC-02: Allowlist de extensiones - extensión bloqueada
```typescript
  it('should reject blocked extensions', async () => {
    // GIVEN: File with blocked extension .exe
    const file = { name: 'malware.exe', mimeType: 'application/x-msdownload' };
    
    // WHEN: Validating
    const result = await uploadMiddleware.validateExtension(file);
    
    // THEN: Returns invalid
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('EXTENSION_NOT_ALLOWED');
  });
```

#### TC-03: Validación MIME type coincide con extensión
```typescript
  it('should reject mismatched mime type', async () => {
    // GIVEN: File with .pdf but wrong mime type
    const file = { name: 'fake.pdf', mimeType: 'application/javascript' };
    
    // WHEN: Validating
    const result = await uploadMiddleware.validateMimeType(file);
    
    // THEN: Returns invalid
    expect(result.isValid).toBe(false);
  });
```

#### TC-04: Sanitización de filenames - path traversal
```typescript
  it('should reject path traversal attempts', async () => {
    // GIVEN: Malicious filename
    const filename = '../../../etc/passwd';
    
    // WHEN: Sanitizing
    const result = sanitizeFilename(filename);
    
    // THEN: Returns sanitized, no traversal
    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
  });
```

#### TC-05: Límite de tamaño
```typescript
  it('should reject files over size limit', async () => {
    // GIVEN: File over 100MB
    const file = { size: 101 * 1024 * 1024 };
    
    // WHEN: Validating size
    const result = uploadMiddleware.validateSize(file);
    
    // THEN: Returns invalid
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('FILE_TOO_LARGE');
  });
```

### 2.2 URL Validator

#### TC-06: Dominios permitidos
```typescript
describe('UrlValidator', () => {
  it('should accept allowed domains', async () => {
    // GIVEN: YouTube URL
    const url = 'https://www.youtube.com/watch?v=abc123';
    
    // WHEN: Validating
    const result = await urlValidator.validate(url);
    
    // THEN: Returns valid
    expect(result.isValid).toBe(true);
  });
});

#### TC-07: Dominios bloqueados
  it('should reject blocked domains', async () => {
    // GIVEN: Random domain
    const url = 'https://evil-site.com/video';
    
    // WHEN: Validating
    const result = await urlValidator.validate(url);
    
    // THEN: Returns invalid
    expect(result.isValid).toBe(false);
  });

#### TC-08: URLs con tokens - rechazadas
  it('should reject URLs with auth tokens', async () => {
    // GIVEN: URL with token parameter
    const url = 'https://drive.google.com/file?token=abc123';
    
    // WHEN: Validating
    const result = await urlValidator.validate(url);
    
    // THEN: Returns invalid
    expect(result.isValid).toBe(false);
  });
```

### 2.3 Content Moderation (Mock)

#### TC-09: Contenido permitido
```typescript
describe('ContentModerationService', () => {
  it('should allow clean content', async () => {
    // GIVEN: Clean content
    const content = 'This is a great ebook about cooking';
    
    // WHEN: Moderating
    const result = await moderationService.check(content);
    
    // THEN: Returns flagged=false
    expect(result.flagged).toBe(false);
  });
});

#### TC-10: Contenido prohibido
  it('should flag prohibited content', async () => {
    // GIVEN: Content with prohibited terms
    const content = 'Buy cheap pills now';
    
    // WHEN: Moderating
    const result = await moderationService.check(content);
    
    // THEN: Returns flagged=true
    expect(result.flagged).toBe(true);
    expect(result.categories).toContain('illegal');
  });
```

---

## 3. Integration Tests

### 3.1 Upload Endpoint

#### IT-01: Upload exitoso con archivo válido
```typescript
describe('POST /api/products/upload', () => {
  it('should upload valid file successfully', async () => {
    // GIVEN: Auth token + valid PDF file
    const token = await getAuthToken('creator');
    const file = createTestFile('ebook.pdf', 'application/pdf');
    
    // WHEN: Uploading
    const res = await request(app)
      .post('/api/products/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file);
    
    // THEN: Returns 201
    expect(res.status).toBe(201);
    expect(res.body.productId).toBeDefined();
  });
});
```

#### IT-02: Upload rechazado - extensión bloqueada
  it('should reject blocked extension', async () => {
    // GIVEN: Auth token + exe file
    const token = await getAuthToken('creator');
    const file = createTestFile('virus.exe', 'application/x-msdownload');
    
    // WHEN: Uploading
    const res = await request(app)
      .post('/api/products/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file);
    
    // THEN: Returns 400
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EXTENSION_NOT_ALLOWED');
  });
```

---

## 4. Security Tests

### 4.1 Malware Detection

#### ST-01: Archivo executable bloqueado
```typescript
describe('Security: Malware Detection', () => {
  it('should block all executable types', async () => {
    const blockedExtensions = ['.exe', '.bat', '.sh', '.msi', '.scr', '.pif'];
    
    for (const ext of blockedExtensions) {
      const file = createTestFile(`malware${ext}`, 'application/octet-stream');
      const res = await uploadMiddleware.validateExtension(file);
      expect(res.isValid).toBe(false);
    }
  });
});
```

#### ST-02: Filename sanitization - XSS prevention
  it('should sanitize XSS in filenames', async () => {
    const malicious = '<script>alert(1)</script>.pdf';
    const sanitized = sanitizeFilename(malicious);
    
    expect(sanitized).not.toContain('<');
    expect(sanitized).not.toContain('>');
  });
```

---

## 5. Test Data Fixtures

```typescript
// src/__tests__/fixtures/content-security.ts
export const validFiles = [
  { name: 'ebook.pdf', mimeType: 'application/pdf', size: 5 * 1024 * 1024 },
  { name: 'video.mp4', mimeType: 'video/mp4', size: 50 * 1024 * 1024 },
  { name: 'audio.mp3', mimeType: 'audio/mpeg', size: 10 * 1024 * 1024 },
];

export const blockedFiles = [
  { name: 'virus.exe', mimeType: 'application/x-msdownload' },
  { name: 'script.bat', mimeType: 'text/plain' },
  { name: 'shell.sh', mimeType: 'application/x-sh' },
];

export const allowedDomains = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'drive.google.com',
];

export const blockedDomains = [
  'random-site.com',
  'evil-download.net',
];
```

---

## 6. Coverage Target

| Tipo | Target |
|------|--------|
| Unit Tests | >= 80% |
| Integration | Core flows |
| Security | All validations |

---

**Test Plan Creado**: Abril 2026  
**Estado**: Listo para Implementación