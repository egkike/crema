# Security Documentation

This document outlines the security measures, vulnerabilities addressed, and best practices implemented in the Crema backend.

> **Last Updated:** 2026
> **Review Frequency:** Quarterly

---

## Table of Contents

1. [Security Architecture](#security-architecture)
2. [Authentication & Authorization](#authentication--authorization)
3. [Input Validation](#input-validation)
4. [Rate Limiting](#rate-limiting)
5. [Payment Security](#payment-security)
6. [Database Security](#database-security)
7. [Security Headers](#security-headers)
8. [Audit Checklist](#audit-checklist)

---

## Security Architecture

### Defense in Depth

Crema implements multiple layers of security:

```
┌─────────────────────────────────────┐
│        Security Headers             │  ← Helmet.js
├─────────────────────────────────────┤
│        Rate Limiting                │  ← express-rate-limit
├─────────────────────────────────────┤
│        Authentication                │  ← JWT + 2FA
├─────────────────────────────────────┤
│        Input Validation              │  ← Zod schemas
├─────────────────────────────────────┤
│        Authorization                │  ← RBAC + Ownership checks
├─────────────────────────────────────┤
│        Database                     │  ← Parameterized queries
└─────────────────────────────────────┘
```

---

## Authentication & Authorization

### JWT Implementation

- **Access Tokens:** Short-lived (configurable), stored in httpOnly cookies
- **Refresh Tokens:** Longer-lived, rotated on use
- **Token Storage:** Cookies with `httpOnly`, `secure`, `sameSite: 'strict'`

```typescript
// JWT Configuration
const token = jwt.sign(payload, config.jwtSecret, {
  expiresIn: '15m',  // Access token
  algorithm: 'HS256'
});
```

### Password Security

- **Algorithm:** bcrypt with 12 salt rounds
- **Pepper:** Additional secret configured via environment
- **Verification:** Constant-time comparison to prevent timing attacks

```typescript
// Password hashing
const hash = await bcrypt.hash(passwordWithPepper, 12);

// Password verification
const isValid = await bcrypt.compare(password + pepper, storedHash);
```

### Two-Factor Authentication (2FA)

- TOTP-based (Google Authenticator compatible)
- Partial tokens for first-time password change
- Separate verification flow

### Role-Based Access Control (RBAC)

```typescript
// Admin-only routes
router.get('/admin/users', jwtAuthMiddleware, restrictTo('ADMIN'), handler);
```

---

## Input Validation

### Zod Schema Validation

All user inputs are validated using Zod schemas:

```typescript
// Example: Login validation
export const loginSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().optional(),
  password: z.string().min(1, 'Password required'),
}).refine(data => data.email || data.username, {
  message: 'Email or username required'
});
```

### Query Parameter Validation

Numeric parameters are clamped to safe bounds:

```typescript
// Safe pagination
const limit = parseClamped(req.query.limit, 20, 1, 100);
const offset = parseClamped(req.query.offset, 0, 0, 10000);
```

---

## Rate Limiting

### Implemented Limiters

| Limiter | Endpoint | Limit | Window |
|---------|----------|-------|--------|
| `loginLimiter` | POST /auth/login | 5 attempts | 15 min |
| `refreshLimiter` | POST /auth/refresh | 10 requests | 30 min |
| `apiLimiter` | General protected | 100 requests | 1 min |
| `aiLimiter` | AI endpoints | 30 requests | 1 min |
| `aiChatLimiter` | AI chat streams | 10 requests | 1 min |

### Response Headers

All limiters return standard rate limit headers:
- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`

---

## Payment Security

### MercadoPago Integration

- **Webhook Verification:** HMAC-SHA256 signature validation
- **Idempotency:** Prevents duplicate payment processing
- **Refund Validation:** Amount verification before processing

```typescript
// Webhook signature verification
const manifest = `id:${resourceId};request-id:${xRequestId};ts:${ts};`;
const hmac = crypto.createHmac('sha256', webhookSecret).update(manifest);
if (hmac !== hash) {
  return null; // Invalid signature
}
```

### Credit Transactions

- Atomic operations with rollback
- Balance checks before deduction
- Audit logging for all transactions

---

## Database Security

### SQL Injection Prevention

- **Parameterized queries:** All values use `$1, $2` placeholders
- **Schema allowlist:** Only pre-defined schemas allowed
- **No string concatenation:** Query building via parameterized statements

```typescript
// ✅ Safe - parameterized
pool.query('SELECT * FROM users WHERE id = $1', [userId]);

// ❌ Unsafe - string concatenation
pool.query(`SELECT * FROM users WHERE id = '${userId}'`);
```

### Schema Validation

```typescript
const ALLOWED_SCHEMAS = ['public', 'crema'];
const schema = getValidatedSchema(); // Validates against allowlist
```

---

## Security Headers

Implemented via Helmet.js:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | nosniff |
| `X-Frame-Options` | DENY |
| `X-XSS-Protection` | 1; mode=block |
| `Strict-Transport-Security` | max-age=31536000 |
| `Content-Security-Policy` | configured for API |

---

## Audit Checklist

Before every commit, verify:

- [ ] No hardcoded passwords, API keys, or secrets
- [ ] All user inputs validated with Zod
- [ ] All database queries use parameterized statements
- [ ] Auth middleware protects private routes
- [ ] Error messages don't expose internal details
- [ ] Environment variables documented in `.env.example`
- [ ] Rate limiting configured on public endpoints
- [ ] Dependencies have no known vulnerabilities (`pnpm audit`)

---

## Vulnerabilities Addressed

### Fixed in Previous Sessions

| Vulnerability | Status | Fix Applied |
|---------------|--------|--------------|
| Missing product ownership verification | ✅ Fixed | Ownership checks added to 9+ endpoints |
| SQL injection via schema interpolation | ✅ Fixed | Schema allowlist validation |
| Missing rate limiting on AI endpoints | ✅ Fixed | aiLimiter/aiChatLimiter applied |
| Missing admin RBAC on reports | ✅ Fixed | restrictTo('ADMIN') added |
| Error messages exposing internals | ✅ Fixed | Generic error messages |
| Missing Zod input validation | ✅ Fixed | Schemas applied to all endpoints |
| Type safety issues (req.user!) | ✅ Fixed | Proper type annotations |
| Missing credits refund on abort | ✅ Fixed | AbortSignal support |
| SSE connection check | ✅ Fixed | writableEnded verification |

---

## Reporting Security Issues

If you discover a security vulnerability, please report it to the security team immediately. Do not create a public GitHub issue.

---

## Related Documentation

- [Authentication API](./api/authentication.md)
- [Error Handling](./api/errors.md)
- [Payment Endpoints](./api/endpoints/payments.md)
