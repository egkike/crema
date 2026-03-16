# Endpoints: Learning (LMS)

## Overview

Sistema de gestión de aprendizaje (Learning Management System) - seguimiento de progreso, lecciones, quizzes y certificados.

## Endpoints

---

### Verify Certificate

```
GET /api/learning/certificate/verify/:code
```

Verifica la autenticidad de un certificado.

**Autenticación:** No requerida (público)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "certificate": {
      "code": "CERT-ABC123",
      "student_name": "Juan Pérez",
      "course_title": "Curso de TypeScript",
      "completed_at": "2024-03-15T14:30:00Z",
      "certificate_url": "https://..."
    }
  }
}
```

---

### Get My Learning Dashboard

```
GET /api/learning/my-dashboard
```

Obtiene el dashboard de aprendizaje del usuario.

**Autenticación:** Requiere access token

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "product_id": "uuid",
      "title": "Curso de TypeScript",
      "progress": 65,
      "last_accessed": "2024-03-15T14:30:00Z",
      "total_lessons": 20,
      "completed_lessons": 13
    }
  ]
}
```

---

### Update Lesson Progress

```
POST /api/learning/progress
```

Actualiza el progreso de una lección.

**Autenticación:** Requiere access token

**Request Body:**

```json
{
  "lesson_id": "uuid",
  "product_id": "uuid",
  "completed": true,
  "time_spent": 300
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "lesson_id": "uuid",
    "completed": true,
    "progress_percentage": 65
  }
}
```

---

### Submit Quiz

```
POST /api/learning/quiz/submit
```

Envía respuestas de un quiz.

**Autenticación:** Requiere access token

**Request Body:**

```json
{
  "lesson_id": "uuid",
  "answers": [
    { "question_id": "q1", "selected_option": "a" },
    { "question_id": "q2", "selected_option": "c" }
  ]
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "score": 80,
    "passed": true,
    "total_questions": 5,
    "correct_answers": 4,
    "can_retry": true,
    "max_attempts": 3
  }
}
```

---

### Get Product Content

```
GET /api/learning/:productId/content
```

Obtiene el contenido de un producto (video, texto, descarga).

**Autenticación:** Requiere access token + haber comprado el producto

**Response (200):**

```json
{
  "success": true,
  "data": {
    "modules": [
      {
        "id": "uuid",
        "title": "Módulo 1: Introducción",
        "lessons": [
          {
            "id": "uuid",
            "title": "Lección 1",
            "type": "video",
            "duration": 1200,
            "completed": true
          }
        ]
      }
    ]
  }
}
```

---

### Get Lesson Detail

```
GET /api/learning/lesson/:lessonId
```

Obtiene detalles de una lección específica.

**Autenticación:** Requiere access token

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Introducción a TypeScript",
    "type": "video",
    "content": {
      "video_url": "https://stream.mux.com/...",
      "duration": 1200,
      "transcript": "..."
    },
    "next_lesson_id": "uuid",
    "prev_lesson_id": null
  }
}
```

---

## Tipos de Contenido

| Tipo | Descripción |
|------|-------------|
| `video` | Video streaming |
| `text` | Texto/artículo |
| `download` | Archivo descargable |
| `quiz` | Evaluación |

---

## Progreso

El progreso se calcula automáticamente:
- Porcentage = (lecciones completadas / total lecciones) * 100

Cuando se alcanza 100%, se genera automáticamente el certificado.

---

## Certificados

Los certificados incluyen:
- Código único de verificación
- Nombre del estudiante
- Título del curso
- Fecha de completitud
- URL pública de verificación

---

## Ver También

- [Features: LMS](../../features/lms.md)
- [Errores](../errors.md)
