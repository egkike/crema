# SDD Tasks: User Context

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura / Feature  
**SDD Phase**: Tasks  
**Estado**: ✅ DOC COMPLETA (tabla DB pending)  
**Depends on**: design.md

---

## Task List

| # | Task | Prioridad | Estado | Depende de |
|---|------|:---------:|--------|-----------|
| 1 | Crear tabla user_context | 🔴 ALTA | - |
| 2 | Crear tabla user_notes | 🔴 ALTA | 1 |
| 3 | Crear UserContextRepository | 🔴 ALTA | 1 |
| 4 | Crear UserNotesRepository | 🔴 ALTA | 2 |
| 5 | Crear UserContextService | 🔴 ALTA | 3 |
| 6 | Crear UserNotesService | 🔴 ALTA | 4 |
| 7 | Agregar routes | 🟡 MEDIA | 5, 6 |
| 8 | Tests unitarios | 🟡 MEDIA | 5, 6 |

---

## Task Details

### Task 1-2: Tablas SQL

```sql
-- db/init/XX-user-context-tables.sql

CREATE TABLE user_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    context_data JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

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

### Task 3-4: Repositories

```typescript
// src/repositories/user-context.repository.ts
export const userContextRepository = {
  async find({ userId, productId }) { ... },
  async create(data) { ... },
  async update(id, data) { ... },
};

// src/repositories/user-notes.repository.ts
export const userNotesRepository = {
  async findByUser(userId) { ... },
  async create(data) { ... },
  async delete(id) { ... },
};
```

### Task 5-6: Services

```typescript
// src/services/user-context.service.ts
export const userContextService = {
  async getContext(userId, productId) { ... },
  async updateProgress(userId, productId, progress) { ... },
  async saveQuestion(userId, productId, question) { ... },
};

// src/services/user-notes.service.ts
export const userNotesService = {
  async createNote(userId, productId, note) { ... },
  async getNotes(userId, productId) { ... },
  async deleteNote(userId, noteId) { ... },
};
```

---

## Estado

**Estado**: DRAFT