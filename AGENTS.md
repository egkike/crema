# Code Review Rules - GGA

## General Rules

**REJECT** if:
- Hardcoded secrets, API keys, passwords, or credentials
- `any` type in TypeScript — use specific types or interfaces
- Empty catch blocks (silent error handling)
- `console.log`, `console.error`, or `console.warn` in production code
- Direct string concatenation in SQL queries — use parameterized queries
- Unvalidated user input
- Missing authentication/authorization on protected routes

**PREFER:**
- `const` over `let`, never `var`
- Optional chaining (`?.`) and nullish coalescing (`??`)
- `===` over `==`
- Parameterized database queries (`$1`, `$2` placeholders)
- Environment variables over hardcoded config

## TypeScript/Node.js

**REJECT** if:
- `import * as React` — use named imports (`import { useState }`)
- `var()` keyword usage
- Missing return types on exported functions
- Synchronous code in async contexts without justification

**PREFER:**
- Interfaces over types for object shapes
- Async/await over callbacks
- Explicit return types for public APIs

## React

**REJECT** if:
- Class components — use functional components
- Missing `"use client"` directive in client components
- Inline styles instead of Tailwind classes

**PREFER:**
- Tailwind utility classes over custom CSS
- `cn()` for conditional class merging
- Named exports for components

## Security

**REJECT** if:
- JWT without expiration (`exp` claim)
- Algorithm 'none' in JWT configuration
- Sensitive data in JWT payload
- Missing rate limiting on public endpoints
- CORS allowing wildcard (`*`) in production
- Stack traces or internal paths exposed in error messages

**PREFER:**
- bcrypt/argon2 for password hashing
- httpOnly, secure, sameSite cookies for sessions
- RBAC at service layer
- Environment variables for secrets

## Express/API

**REJECT** if:
- Missing input validation middleware
- No centralized error handling
- Routes without auth middleware on protected endpoints

**PREFER:**
- zod/joi/express-validator for input validation
- Standard error response format
- Middleware chains for cross-cutting concerns