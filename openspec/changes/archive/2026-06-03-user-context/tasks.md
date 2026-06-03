# SDD Tasks: User Context

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura / Feature  
**SDD Phase**: Tasks  
**Estado**: ✅ DOC COMPLETA + IMPLEMENTADO (2026-04-25)  
**Depends on**: design.md

---

## Task List

| # | Task | Prioridad | Estado | Depende de |
|---|------|:---------:|--------|-----------|
| 1 | Crear tabla user_context | 🔴 ALTA | ✅ | - |
| 2 | Crear tabla user_notes | 🔴 ALTA | ✅ | 1 |
| 3 | Crear UserContextRepository | 🔴 ALTA | ✅ | 1 |
| 4 | Crear UserNotesRepository | 🔴 ALTA | ✅ | 2 |
| 5 | Crear UserContextService | 🔴 ALTA | ✅ | 3 |
| 6 | Crear UserNotesService | 🔴 ALTA | ✅ | 4 |
| 7 | Agregar routes | 🟡 MEDIA | ✅ | 5, 6 |
| 8 | Tests unitarios | 🟡 MEDIA | ✅ | 5, 6 |

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

**Estado**: ✅ COMPLETO (2026-04-25)

Tareas T-1 a T-8 completadas:
- Tablas SQL en db/init/10-user-context-tables.sql
- Repositories: user-context.repository.ts, user-notes.repository.ts
- Services: user-context.service.ts, user-notes.service.ts
- Routes en user.routes.ts
- Tests: user-context.service.test.ts (15 test cases)

---

## Task: Update Project Documentation

**Depends on**: All tasks complete and verified

### What to do

Update these project documents to reflect that User Context is implemented:

#### 1. Update reusable-resources.md

Add to Repositories table in `docs/project/reusable-resources.md`:
```markdown
| `userContextRepository` | User context persistence | Singleton |
| `userNotesRepository` | User notes persistence | Singleton |
```

Add to Services section:
```markdown
| `userContextService` | User context management | Singleton |
| `userNotesService` | User notes management | Singleton |
```

Add to Active SDDs Reference section:
```markdown
- `openspec/changes/archive/2026-06-03-user-context/` — User context y notas
```

#### 2. Update backend/README.md (if exists)

If `backend/README.md` exists, add User Context API reference.

### Verification
- [ ] reusable-resources.md updated (Repositories + Services + Active SDDs)
- [ ] backend/README.md updated (if exists)