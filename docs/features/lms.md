# LMS (Learning Management System)

## Overview

El sistema LMS de Crema permite a los creadores ofrecer cursos estructurados con módulos, lecciones, seguimiento de progreso, quizzes y certificados.

## Estructura de un Curso

```
products (type = 'course')
    │
    ├── product_modules
    │       │
    │       ├── lesson 1 (video)
    │       ├── lesson 2 (video)
    │       ├── lesson 3 (quiz)
    │       │
    │       └── lesson 4 (text)
    │
    ├── product_modules
    │       │
    │       └── lesson 5 (video)
    │
    └── product_modules
            │
            └── lesson 6 (download)
```

## Componentes del LMS

### 1. Módulos

```sql
CREATE TABLE product_modules (
    id UUID PRIMARY KEY,
    product_id UUID REFERENCES products(id),
    title VARCHAR(255) NOT NULL,
    order_index INT DEFAULT 0
);
```

### 2. Lecciones

```sql
CREATE TABLE product_lessons (
    id UUID PRIMARY KEY,
    module_id UUID REFERENCES product_modules(id),
    title VARCHAR(255),
    content_type VARCHAR(20),  -- video, pdf, text, quiz, link
    content_url TEXT,          -- URL del contenido
    duration_seconds INT,      -- Duración en segundos
    body_text TEXT,            -- Contenido de texto
    order_index INT,
    is_preview BOOLEAN DEFAULT FALSE  -- Clase muestra gratuita
);
```

### 3. Quizzes

```sql
CREATE TABLE product_lesson_quizzes (
    id UUID PRIMARY KEY,
    lesson_id UUID REFERENCES product_lessons(id),
    questions JSONB NOT NULL,  -- Array de preguntas
    passing_score INT DEFAULT 80,
    max_attempts INT           -- NULL = ilimitado
);
```

Estructura de preguntas:
```json
[
  {
    "id": 1,
    "question": "¿Qué es TypeScript?",
    "options": [
      { "id": "a", "text": "Un lenguaje de programación", "is_correct": true },
      { "id": "b", "text": "Un framework", "is_correct": false },
      { "id": "c", "text": "Un editor de texto", "is_correct": false }
    ]
  }
]
```

### 4. Progreso

```sql
CREATE TABLE user_lessons_progress (
    user_id UUID,
    lesson_id UUID,
    product_id UUID,
    completed_at TIMESTAMP,
    PRIMARY KEY (user_id, lesson_id)
);
```

### 5. Certificados

```sql
CREATE TABLE user_certificates (
    id UUID PRIMARY KEY,
    user_id UUID,
    product_id UUID,
    certificate_code UUID UNIQUE,
    issued_at TIMESTAMP,
    UNIQUE(user_id, product_id)
);
```

---

## Flujo de Aprendizaje

### 1. Ver Dashboard

```
GET /api/learning/my-dashboard
```

```json
{
  "data": [
    {
      "product_id": "uuid",
      "title": "Curso de TypeScript",
      "progress": 65,
      "total_lessons": 20,
      "completed_lessons": 13,
      "last_accessed": "2024-03-15T14:30:00Z"
    }
  ]
}
```

### 2. Ver Contenido del Curso

```
GET /api/learning/:productId/content
```

Retorna estructura de módulos y lecciones.

### 3. Marcar Lección como Completada

```
POST /api/learning/progress
```

```json
{
  "lesson_id": "uuid",
  "product_id": "uuid",
  "completed": true,
  "time_spent": 300
}
```

### 4. Rendir Quiz

```
POST /api/learning/quiz/submit
```

```json
{
  "lesson_id": "uuid",
  "answers": [
    { "question_id": 1, "selected_option": "a" },
    { "question_id": 2, "selected_option": "c" }
  ]
}
```

Response:
```json
{
  "score": 80,
  "passed": true,
  "total_questions": 5,
  "correct_answers": 4,
  "can_retry": true,
  "max_attempts": 3
}
```

### 5. Obtener Certificado

Se genera automáticamente cuando `progress = 100%`.

```
GET /api/learning/certificate/verify/:code
```

```json
{
  "valid": true,
  "certificate": {
    "code": "CERT-ABC123",
    "student_name": "Juan Pérez",
    "course_title": "Curso de TypeScript",
    "completed_at": "2024-03-15T14:30:00Z",
    "certificate_url": "https://crema.com/cert/CERT-ABC123"
  }
}
```

---

## Cálculo de Progreso

```typescript
const progress = (completedLessons / totalLessons) * 100;

// Ejemplo:
// 13 lecciones completadas / 20 totales = 65%
```

---

## Tipos de Contenido

| Tipo | Descripción | Tracking |
|------|-------------|----------|
| `video` | Video streaming | Time watched, completed |
| `text` | Artículo/Texto | Scroll position |
| `quiz` | Evaluación | Score, attempts |
| `download` | Archivo | Download count |

---

## Certificados

### Generación Automática

Los certificados se generan automáticamente cuando:
1. Progreso = 100%
2. Todos los quizzes obligatorios están aprobados

### Contenido del Certificado

```json
{
  "certificate_code": "UUID-UNICO",
  "student_name": "Juan Pérez",
  "course_title": "Curso de TypeScript",
  "creator_name": "Carlos López",
  "completed_at": "2024-03-15T14:30:00Z",
  "duration_hours": 20,
  "verification_url": "https://crema.com/verify/UUID"
}
```

### Verificación

Cualquier persona puede verificar un certificado:
```
GET /api/learning/certificate/verify/:code
```

---

## LMS API Endpoints

| Endpoint | Descripción |
|----------|-------------|
| `GET /learning/my-dashboard` | Dashboard del estudiante |
| `GET /learning/:productId/content` | Contenido del curso |
| `GET /learning/lesson/:lessonId` | Detalle de lección |
| `POST /learning/progress` | Actualizar progreso |
| `POST /learning/quiz/submit` | Enviar quiz |
| `GET /learning/certificate/verify/:code` | Verificar certificado |

---

## Características Avanzadas

### Lecciones Previews

```sql
is_preview BOOLEAN DEFAULT FALSE
```

Permite mostrar una clase gratuita sin comprar.

### Duración de Videos

```sql
duration_seconds INT
```

Usado para estimar tiempo de completion.

### Intentos de Quiz

```sql
max_attempts INT  -- NULL = ilimitado
```

Controla cuántas veces se puede intentar un quiz.

---

## Integración con Safe-Guard

El progreso del estudiante afecta la elegibilidad para reembolsos:

- **Progreso < 30%**: Reembolso completo disponible
- **Progreso > 30%**: Sin reembolso automático

---

## Ver También

- [API: Learning](../api/endpoints/learning.md)
- [Features: Safe-Guard](./safeguard.md)
- [Features: Streaming](./streaming.md)
