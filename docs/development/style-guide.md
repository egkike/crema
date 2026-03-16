# Guía de Estilo de Código

## Principios Generales

1. **Claridad sobre clever code**: Código legible es mejor que código inteligente
2. **SOLID**: Aplicar principios de diseño
3. **DRY**: Don't Repeat Yourself, pero no a costa de legibilidad
4. **Consistencia**: Seguí los patrones existentes del proyecto

---

## TypeScript

### Tipos - Nunca usar `any`

❌ **MALO:**
```typescript
const data: any = response.data;
function parse(input: any): any { ... }
```

✅ **BUENO:**
```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

const data: User = response.data;
function parse(input: string): User { ... }
```

### Type Inference

✅ **Dejar que TypeScript infiera cuando es obvio:**
```typescript
const users = await getUsers(); // infiere User[]
const user = users[0]; // infiere User
```

❌ **No redundar:**
```typescript
const users: User[] = await getUsers();
```

### Interfaces vs Types

- **Interface**: Para objetos y clases
```typescript
interface User {
  id: string;
  name: string;
}
```

- **Type**: Para tipos union, alias, primitivos
```typescript
type Status = 'pending' | 'approved' | 'rejected';
type ID = string | number;
```

### Nullish Coalescing y Optional Chaining

✅ **Usar:**
```typescript
const name = user?.name ?? 'Anonymous';
const value = data?.items?.[0]?.id;
```

❌ **Evitar:**
```typescript
const name = user && user.name ? user.name : 'Anonymous';
```

---

## Nombres

### Variables y Funciones

- **camelCase**
- **Ser descriptivo**
- **Evitar abreviaciones excepto:**

| Abreviatura | Significado |
|------------|-------------|
| `id` | identifier |
| `req` | request |
| `res` | response |
| `err` | error |
| `ctx` | context |
| `config` | configuration |

✅ **Buenos:**
```typescript
const userId = 'uuid';
const getUserById = async (id: string) => { ... };
const isUserActive = user.active === 1;
```

❌ **Malos:**
```typescript
const u = 'uuid';
const getUsr = async (i: string) => { ... };
const activa = user.active === 1;
```

### Clases e Interfaces

- **PascalCase**
```typescript
class UserService { ... }
interface PaymentProvider { ... }
```

### Constantes

- **UPPER_SNAKE_CASE** para valores que no cambian
```typescript
const MAX_RETRY_COUNT = 3;
const DEFAULT_TIMEOUT = 5000;
```

---

## Funciones

### Parámetros

✅ **Pocos parámetros (máx 3):**
```typescript
function createUser(name: string, email: string, role: Role): User
```

❌ **Muchos parámetros → usar objeto:**
```typescript
// Malo
function createUser(name, email, role, phone, address, taxId, ...)

// Bueno
function createUser(params: CreateUserParams): User
```

### early return

✅ **Usar early returns:**
```typescript
if (!user) {
  throw new Error('User not found');
}
if (!user.isActive) {
  return null;
}
// lógica principal
```

❌ **Evitar nesting profundo:**
```typescript
// Evitar esto
if (user) {
  if (user.isActive) {
    if (user.role === 'admin') {
      // lógica
    }
  }
}
```

### Funciones pequeñas

- Una función debe hacer **una cosa**
- Máximo 30-40 líneas idealmente
- Si es más larga, considerar拆分 (split)

---

## Imports

### Orden de Imports

```typescript
// 1. Node modules
import express from 'express';
import jwt from 'jsonwebtoken';

// 2. Paquetes externos
import { z } from 'zod';
import axios from 'axios';

// 3. Imports internos (relative)
import { UserService } from '../services/user.service';
import { AppError } from '../errors/AppError';

// 4. Tipos
import type { Request, Response } from 'express';
```

### Imports con Path Alias

```typescript
// Usar alias configurados en tsconfig.json
import { config } from '@/config';
import { UserRepository } from '@/repositories/user.repository';
```

### Barrel Files (Evitar si no es necesario)

❌ **No usar barrel files (index.ts) para re-exportar todo:**
```typescript
// backend/src/index.ts
export * from './services/auth.service';
export * from './services/user.service';
// ... cientos de exports
```

✅ **Imports directos:**
```typescript
import { AuthService } from '@/services/auth.service';
```

---

## Errores y Excepciones

### Custom Errors

✅ **Usar AppError:**
```typescript
throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
```

### Try-Catch

✅ **Wrapping mínimo:**
```typescript
try {
  const user = await userService.getById(id);
  return user;
} catch (error) {
  logger.error({ error, userId: id }, 'Error getting user');
  throw error;
}
```

❌ **No swallow errors:**
```typescript
try {
  // ...
} catch (e) {
  // NO HACER ESTO
}
```

---

## Async/Await

### Always use async/await

✅ **Sobre promise chains:**
```typescript
const user = await userService.getById(id);
const orders = await orderService.getByUser(user.id);
```

❌ **Evitar:**
```typescript
userService.getById(id)
  .then(user => orderService.getByUser(user.id))
  .then(orders => ...);
```

### Error Handling

```typescript
async function getData() {
  try {
    return await fetchData();
  } catch (error) {
    if (error instanceof AppError) {
      throw error; // Re-throw known errors
    }
    // Wrap unknown errors
    throw new AppError('Failed to get data', 500, 'FETCH_ERROR');
  }
}
```

---

## Base de Datos

### Queries - Usar Repository Pattern

```typescript
// Repository
class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }
}

// Service
class UserService {
  async getUserByEmail(email: string) {
    return this.userRepository.findByEmail(email);
  }
}
```

### SQL - Nombres

- Tablas: `snake_case` plural → `user_profiles`
- Columnas: `snake_case` → `created_at`
- Keys: descriptivos → `fk_user_orders`

---

## Testing

### Naming

```typescript
describe('UserService', () => {
  describe('getUserById', () => {
    it('should return user when exists', () => { ... });
    it('should throw AppError when not found', () => { ... });
  });
});
```

### Estructura AAA

```typescript
it('should create a user', () => {
  // Arrange
  const userData = { name: 'John', email: 'john@test.com' };
  
  // Act
  const result = userService.create(userData);
  
  // Assert
  expect(result.name).toBe('John');
});
```

---

## Comments

### Cuándo Comentar

✅ **Explicar el "por qué", no el "qué":**
```typescript
// Usamos bcrypt en lugar de argon2 porque es el estándar actual del equipo
// y tenemos más experiencia debugueando problemas con él.
```

❌ **No explicar código obvio:**
```typescript
// Increment i
i++;
```

### JSDoc

✅ **Para funciones públicas/exportadas:**
```typescript
/**
 * Crea un nuevo usuario en el sistema.
 * 
 * @param userData - Datos del usuario a crear
 * @returns El usuario creado con su ID
 * @throws AppError si el email ya existe
 */
async function createUser(userData: CreateUserDTO): Promise<User>
```

---

## Archivos

### Un archivo, una responsabilidad

❌ **Evitar:**
```typescript
// user.controller.ts (1000 líneas)
// funciones de auth, users, products, etc.
```

✅ **Organizado:**
```
controllers/
├── user.controller.ts
├── auth.controller.ts
├── product.controller.ts
```

### Naming

- **kebab-case** para archivos: `user.service.ts`
- **PascalCase** para tests: `user.service.test.ts`

---

## ESLint y Prettier

### Configuración del Proyecto

El proyecto usa:
- ESLint con TypeScript
- Prettier para formatting

### Comandos

```bash
# Verificar errores
pnpm lint

# Auto-fix
pnpm lint:fix

# Formatear
pnpm format

# TypeScript check
pnpm typecheck
```

### Pre-commit Hooks

Asegúrate de que los hooks estén corriendo:
```bash
# Verificar en package.json
"husky": { ... }
```

---

## Recursos

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [Effective TypeScript](https://effectivetypescript.com/)

---

## Ver También

- [Setup Local](./setup.md)
- [Guía de Contribuciones](./contributing.md)
