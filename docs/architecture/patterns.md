# Patrones de Diseño

## Patrones Utilizados en Crema

El proyecto utiliza varios patrones de diseño para mantener el código organizado, testeable y mantenible.

---

## 1. Layered Architecture (Arquitectura por Capas)

### Estructura

```
Routes → Controllers → Services → Repositories → Database
```

### Implementación

```typescript
// Route define el endpoint
router.post('/products', productController.create.bind(productController));

// Controller maneja request/response
class ProductController {
  async create(req, res) {
    const product = await productService.create(req.body);
    res.status(201).json(product);
  }
}

// Service contiene lógica de negocio
class ProductService {
  async create(data) {
    // Reglas de negocio
    const product = await productRepository.create(data);
    return product;
  }
}

// Repository abstrae la base de datos
class ProductRepository {
  async create(data) {
    return db.query('INSERT INTO products ...', [data]);
  }
}
```

### Cuándo Usar
- Reglas de negocio complejas
- Necesidad de testeo unitario
- Separación clara de responsabilidades

---

## 2. Repository Pattern

### Propósito
Abstraer las consultas SQL del resto de la aplicación.

### Implementación

```typescript
// repositories/user.repository.ts
export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const result = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  async create(user: CreateUserInput): Promise<User> {
    const result = await db.query(
      `INSERT INTO users (username, email, password, fullname)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [user.username, user.email, user.password, user.fullname]
    );
    return result.rows[0];
  }
}
```

### Beneficios
- Consultas SQL centralizadas
- Fácil de modificar sin afectar servicios
- Testeable con mocks

---

## 3. Factory Pattern (PaymentProviderFactory)

### Propósito
Crear instancias de proveedores de pago sin conocer la implementación específica.

### Implementación

```typescript
// services/payment/PaymentProvider.ts
export interface PaymentProvider {
  createPayment(amount: number, currency: string): Promise<PaymentResult>;
  processWebhook(payload: any): Promise<WebhookResult>;
}

// services/payment/providers/MercadoPagoProvider.ts
export class MercadoPagoProvider implements PaymentProvider {
  async createPayment(amount: number, currency: string): Promise<PaymentResult> {
    // Implementación específica de Mercado Pago
  }
}

// services/payment/PaymentProviderFactory.ts
export class PaymentProviderFactory {
  static createProvider(gateway: string): PaymentProvider {
    switch (gateway) {
      case 'mercadopago':
        return new MercadoPagoProvider();
      case 'simulator':
        return new SimulatorProvider();
      default:
        throw new Error(`Unknown payment gateway: ${gateway}`);
    }
  }
}
```

### Uso

```typescript
const provider = PaymentProviderFactory.createProvider('mercadopago');
const result = await provider.createPayment(1000, 'ARS');
```

---

## 4. Middleware Pattern

### Propósito
Procesar requests antes de llegar al controller final.

### Ejemplos en el Proyecto

```typescript
// Middleware de autenticación
export const jwtAuthMiddleware = (req, res, next) => {
  const token = req.cookies.access_token || req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  // Verificar token...
  next();
};

// Middleware de autorización por roles
export const requireRole = (...roles: string[]) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};
```

---

## 5. JWT con Refresh Tokens

### Flujo

```
1. Login → Access Token (15min) + Refresh Token (7 días)
2. Request → Access Token en cookie HttpOnly
3. Access expira → Refresh token rota el access token
4. Refresh expira → Usuario debe hacer login nuevamente
```

### Implementación

```typescript
// Generar tokens
const accessToken = jwt.sign(payload, SECRET_JWT_KEY, { expiresIn: '15m' });
const refreshToken = jwt.sign(payload, SECRET_REFRESH_JWT_KEY, { expiresIn: '7d' });

// Middleware de verificación
export const jwtAuthMiddleware = (req, res, next) => {
  const token = req.cookies.access_token;
  try {
    const decoded = jwt.verify(token, SECRET_JWT_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    // Token expirado → intentar refresh
    return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
  }
};
```

---

## 6. Error Handling (AppError)

### Implementación

```typescript
// errors/AppError.ts
export class AppError extends Error {
  constructor(
    message: string,
    statusCode: number = 500,
    code?: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Uso en controladores
throw new AppError('Producto no encontrado', 404, 'PRODUCT_NOT_FOUND');
```

### Manejo Global

```typescript
// app.ts
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code
    });
  }
  // Errores no esperados
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});
```

---

## 7. Queue Pattern (BullMQ)

### Propósito
Procesar tareas asynchronously (emails, limpiezas, webhooks).

### Implementación

```typescript
// queues/main.worker.ts
const emailQueue = new Queue('email', { connection });

// Productor - agregar trabajo
await emailQueue.add('send-welcome', {
  to: user.email,
  template: 'welcome'
});

// Consumidor - procesar trabajo
const worker = new Worker('email', async job => {
  const { to, template } = job.data;
  await emailService.send(to, template);
}, { connection });
```

---

## 8. Schema Validation (Zod)

### Propósito
Validar inputs de request de manera declarativa.

### Implementación

```typescript
// schemas/users.schema.ts
import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  fullname: z.string().optional(),
  tax_id: z.string().optional(),
});

// Middleware de validación
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: result.error.format()
    });
  }
  req.body = result.data;
  next();
};
```

---

## 9. Check-Access Pattern

### Propósito
Verificar acceso a contenido protegido antes de servirlo.

### Implementación

```typescript
// middlewares/checkAccess/checkAccess.middleware.ts
export const checkAccess = async (req, res, next) => {
  const { productId, contentId } = req.params;
  const userId = req.user?.id;

  // Verificar si el usuario tiene acceso
  const hasAccess = await accessService.checkAccess(userId, productId, contentId);

  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied' });
  }

  next();
};
```

---

## Resumen de Patrones

| Patrón | Propósito | Ubicación |
|--------|-----------|------------|
| Layered Architecture | Separación de responsabilidades | General |
| Repository | Abstracción de DB | `repositories/` |
| Factory | Creación de proveedores | `payment/` |
| Middleware | Pre-procesamiento de requests | `middlewares/` |
| JWT + Refresh | Autenticación segura | `auth/` |
| AppError | Manejo de errores | `errors/` |
| Queue | Procesamiento async | `queues/` |
| Zod Schema | Validación de inputs | `schemas/` |
| Check-Access | Protección de contenido | `middlewares/` |

---

## Documentación Relacionada

- [Visión General](./overview.md)
- [Stack Tecnológico](./stack.md)
- [Estructura de Directorios](./directory-structure.md)
- [API](../api/index.md)
