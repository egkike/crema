# SDD Design: User Context

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura / Feature  
**SDD Phase**: Design  
**Estado**: ✅ DOC COMPLETA  
**Depends on**: spec.md

---

## 1. Resumen del Diseño

Implementar servicios de User Context y User Notes.

---

## 2. Arquitectura

### 2.1 Servicios

```
┌─────────────────────────────────────────────────────────────┐
│                    User Context Layer                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────────────┐    ┌──────────────────┐          │
│   │  UserContext     │    │  UserNotes       │          │
│   │    Service       │    │    Service       │          │
│   └────────┬─────────┘    └────────┬─────────┘          │
│            │                       │                       │
│            └───────────┬───────────┘                       │
│                        ▼                               │
│            ┌─────────────────────┐                     │
│            │    Repositories    │                     │
│            └────────┬────────────┘                     │
│                     ▼                                  │
│            ┌─────────────────────┐                    │
│            │  PostgreSQL         │                    │
│            │  user_context       │                    │
│            │  user_notes        │                    │
│            └─────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Interfaz de UserContextService

```typescript
interface UserContextService {
  // Obtener contexto
  getContext(userId: string, productId: string): Promise<UserContext>;
  
  // Guardar progreso
  updateProgress(userId: string, productId: string, progress: number): Promise<void>;
  
  // Guardar pregunta
  saveQuestion(userId: string, productId: string, question: string): Promise<void>;
  
  // Generar lección de refuerzo
  generateReinforcementLesson(userId: string, productId: string): Promise<Lesson>;
}
```

### 2.3 Interfaz de UserNotesService

```typescript
interface UserNotesService {
  // Crear nota
  createNote(userId: string, productId: string, note: NoteInput): Promise<UserNote>;
  
  // Obtener notas
  getNotes(userId: string, productId: string): Promise<UserNote[]>;
  
  // Eliminar nota
  deleteNote(userId: string, noteId: string): Promise<void>;
  
  // Buscar notas
  searchNotes(userId: string, query: string): Promise<UserNote[]>;
}
```

---

## 3. Data Model

### 3.1 DDL

```sql
-- user_context: Contexto de cada usuario por producto
CREATE TABLE user_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    context_data JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

-- user_notes: Notas del usuario en un producto
CREATE TABLE user_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    note_type VARCHAR(20) CHECK (note_type IN ('highlight', 'bookmark', 'note')),
    position JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_context_user ON user_context(user_id);
CREATE INDEX idx_user_notes_user ON user_notes(user_id);
CREATE INDEX idx_user_notes_product ON user_notes(product_id);
```

---

## 4. Seguridad

### 4.1 Ownership Validation

```typescript
// Siempre validar que user_id coincide
async function getUserContext(userId: string, productId: string): Promise<UserContext> {
  const context = await userContextRepo.find({ userId, productId });
  
  if (!context) {
    throw new AppError('Contexto no encontrado', 404);
  }
  
  // CRITICAL: Validar ownership
  if (context.userId !== userId) {
    throw new AppError('No autorizado', 403);
  }
  
  return context;
}
```

---

## 5. Estado

**Estado**: DRAFT