# Streaming de Video Seguro

## Overview

El sistema de streaming de video de Crema proporciona protección contra piratería mediante firmas digitales y streaming adaptativo.

## Proveedores Soportados

| Proveedor | Descripción |
|-----------|-------------|
| **Mux Video** | Plataforma de video streaming con signed URLs |
| **Cloudflare Stream** | Alternativa de streaming |

## Arquitectura

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Cliente   │────►│  API Crema  │────►│  Mux/Cloudflare │
└─────────────┘     └─────────────┘     └─────────────────┘
       │                   │                     │
       │                   │                     │
       │◄──────────────────┘                     │
       │         Signed URL                      │
       │   (expira en X min)                    │
       │                                         │
       ▼                                         ▼
┌─────────────┐                          ┌─────────────────┐
│ Video Player │                          │  HLS Stream    │
│  (Mux/HTML5)│◄────────────────────────│  (fragmentos)  │
└─────────────┘                          └─────────────────┘
```

## Flujo de Acceso a Video

```
1. Usuario autenticado → Solicita ver lección
                      → POST /api/learning/lesson/:id

2. API → Verifica acceso (checkContentAccess middleware)
       → Genera signed URL con Mux

3. API → Retorna signed URL al cliente
       {
         "video_url": "https://stream.mux.com/xxx.m3u8?token=..."
       }

4. Cliente → Reproduce en video player
           → Mux valida token
           → Si válido, reproduce video
```

## Signed URLs

### Concepto

Las signed URLs son URLs que incluyen un token de autenticación que expira después de un tiempo determinado.

### Generación

```typescript
// utils/streaming.util.ts
import Mux from '@mux/mux-node';

export async function generateSignedUrl(videoId: string): Promise<string> {
  // Generar token JWT
  const token = jwt.sign(
    { 
      sub: videoId,
      exp: Math.floor(Date.now() / 1000) + 3600 // 1 hora
    },
    process.env.MUX_SIGNING_KEY,
    { algorithm: 'RS256' }
  );

  // Construir URL
  return `https://stream.mux.com/${videoId}.m3u8?token=${token}`;
}
```

### Beneficios

1. **Temporal**: La URL expira (default: 1 hora)
2. **Segura**: Solo usuarios con token válido pueden acceder
3. **No descargable**: El contenido se sirve en fragmentos HLS
4. **Auditable**: Cada acceso puede ser registrado

---

## Protecciones Implementadas

### 1. Signed URLs

```
✅ Expira en tiempo configurable
✅ No accesible sin token válido
✅ Registro de accesos
```

### 2. HLS Streaming

```
✅ Video en fragmentos (.ts)
✅ No es un archivo MP4 descargable
✅ Adaptive bitrate (calidad automática)
```

### 3. CORS Configuration

```typescript
// Configuración de CORS para video
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        mediaSrc: ["'self'", "blob:", "https://*.mux.com"],
      }
    }
  })
);
```

### 4. Referer Check

```typescript
// Verificar referer
const allowedReferers = ['https://crema.com', 'https://app.crema.com'];
if (!allowedReferers.includes(req.get('referer'))) {
  return 403;
}
```

---

## Tipos de Contenido

| Tipo | Descripción | Protección |
|------|-------------|------------|
| `video` | Video streaming | Signed URL + HLS |
| `pdf` | Documento PDF | Solo con acceso válido |
| `text` | Artículo/Texto | Solo con acceso válido |
| `download` | Archivo descargable | Safe-Guard evalúa |

---

## Tabla: product_lessons

```sql
CREATE TABLE product_lessons (
    id UUID PRIMARY KEY,
    module_id UUID REFERENCES product_modules(id),
    title VARCHAR(255),
    content_type VARCHAR(20) DEFAULT 'video',
    content_url TEXT,          -- ID de Mux o URL
    duration_seconds INT DEFAULT 0,
    is_preview BOOLEAN DEFAULT FALSE  -- Clase muestra gratuita
);
```

---

## Middleware de Acceso

```typescript
// middlewares/checkAccess/checkAccess.middleware.ts
export const checkContentAccess = async (req, res, next) => {
  const { productId } = req.params;
  const userId = req.user?.id;

  // 1. ¿Es preview?
  const lesson = await getLesson(req.params.lessonId);
  if (lesson.is_preview) {
    return next(); // Permitir
  }

  // 2. ¿Usuario compró el producto?
  const hasPurchased = await orderRepository.hasUserPurchased(userId, productId);
  if (!hasPurchased) {
    return res.status(403).json({ error: 'Debes comprar el producto' });
  }

  // 3. ¿Acceso activo (no reembolsado)?
  const hasValidAccess = await accessService.checkValidAccess(userId, productId);
  if (!hasValidAccess) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  next();
};
```

---

## Configuración de Mux

### Variables de Entorno

```env
MUX_TOKEN_ID=xxxxx
MUX_TOKEN_SECRET=xxxxx
MUX_SIGNING_KEY=xxxxx
MUX_SIGNING_PRIVATE_KEY=xxxxx
```

### Políticas de Video

```json
{
  "playback_policy": ["signed"],
  "allowed_domains": ["crema.com", "app.crema.com"],
  "max_resolution": "1080p"
}
```

---

## Video Player

### Recomendado: Mux Player

```html
<script src="https://cdn.jsdelivr.net/npm/@mux/mux-player"></script>

<mux-player
  playback-id="xxxxx"
  tokens='{ "playback": "signed-token" }}'
  metadata-video-title="Lección 1"
></mux-player>
```

---

## Métricas y Analytics

### Datos Recolectados

- Vistas por video
- Tiempo de reproducción
- Dispositivo/Navegador
- Ubicación geográfica
- Intentos de acceso fallidos

---

## Limitaciones y Consideraciones

### Lo que NO protege

- Screen recording (grabación de pantalla)
- Extensions de navegador
- Descarga manual de fragmentos HLS (avanzado)

### Lo que SÍ protege

- Links compartidos públicos
- Scraping automatizado
- Descarga directa del video
- Acceso sin compra

---

## Ver También

- [API: Learning](../api/endpoints/learning.md)
- [Features: Safe-Guard](./safeguard.md)
