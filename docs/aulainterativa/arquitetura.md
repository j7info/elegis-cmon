# Arquitetura do Módulo de Aula Interativa

## Camadas

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (React/Vite)                   │
│                                                          │
│  InteractiveLessonPage (genérico)                        │
│    ├─ Abordagem React → renderiza componentes definidos   │
│    └─ Abordagem HTML  → iframe com a página              │
│                                                          │
│  Builder (futuro) → editor visual de definições          │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP (JSON)
┌──────────────────────▼───────────────────────────────────┐
│                    Backend (Express)                       │
│                                                          │
│  routes/interactiveLessons.ts                            │
│    GET    /api/classes/:id/interactive  → busca config    │
│    POST   /api/classes/:id/interactive  → cria/atualiza   │
│    DELETE /api/classes/:id/interactive  → remove          │
│                                                          │
│  middleware/upload.ts (já existe)                         │
│    → Multer salva em /app/uploads/interactive/            │
└──────────────────────┬───────────────────────────────────┘
                       │ SQL
┌──────────────────────▼───────────────────────────────────┐
│                    PostgreSQL                              │
│                                                          │
│  interactive_lessons                                      │
│    id, class_id, type ('react'|'html'),                   │
│    definition (JSONB), html_url, html_content,            │
│    created_at, updated_at                                │
└──────────────────────────────────────────────────────────┘
```

## Banco de Dados

### Tabela `interactive_lessons`

```sql
CREATE TABLE IF NOT EXISTS interactive_lessons (
  id         SERIAL PRIMARY KEY,
  class_id   INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  type       VARCHAR(10) NOT NULL CHECK (type IN ('react', 'html')),

  -- Abordagem React: definição completa da tela
  definition JSONB,

  -- Abordagem HTML: URL ou conteúdo inline
  html_url      VARCHAR(500),
  html_content  TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(class_id)  -- 1 interactive lesson por aula
);
```

### Migration

Arquivo: `server/src/db/migrations/015_interactive_screens.sql`

---

## Rotas da API

Todas prefixadas com `/api/classes/:classId/interactive`:

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/classes/:classId/interactive` | Retorna a config da aula interativa (ou 404) |
| `POST` | `/api/classes/:classId/interactive` | Cria/substitui a configuração |
| `PUT` | `/api/classes/:classId/interactive` | Atualiza campos específicos |
| `DELETE` | `/api/classes/:classId/interactive` | Remove a aula interativa |

### Exemplo de resposta `GET`

**Abordagem React:**
```json
{
  "id": 1,
  "class_id": 42,
  "type": "react",
  "definition": {
    "title": "Introdução ao Excel",
    "layout": { "width": 10, "height": 6 },
    "gridColumns": ["Nome", "Cargo", "Depto", "Salário"],
    "elements": [
      { "id": "cell_3_2", "type": "cell", "row": 3, "col": 2,
        "info": { "title": "Célula B3", "description": "Valor digitado..." } }
    ]
  }
}
```

**Abordagem HTML:**
```json
{
  "id": 2,
  "class_id": 43,
  "type": "html",
  "html_url": "/api/uploads/interactive/simulador-excel.html"
}
```

---

## Fluxo de dados — Renderização

### React Components

```
1. Página carrega InteractiveLessonPage
2. useEffect → GET /api/classes/:id/interactive
3. Se type === 'react':
   - Importa dinamicamente o componente baseado em definition.id
   - Ou renderiza um GenericGridBaseado na definição
4. Aluno clica → feedback visual + modal com info
5. Cliques podem ser registrados (opcional) como progresso
```

### HTML Embutido

```
1. Página carrega InteractiveLessonPage
2. useEffect → GET /api/classes/:id/interactive
3. Se type === 'html':
   - Se html_url → <iframe src={html_url}>
   - Se html_content → <iframe srcdoc={html_content}>
4. iframe com height 100%, sandbox com permissões configuráveis
5. Comunicação via postMessage (opcional, para registrar progresso)
```

---

## Upload de HTML

O diretório de uploads já é servido estaticamente em `/api/uploads` (ver `server/src/index.ts:72`). Basta criar uma subpasta `interactive/`:

**Upload via formulário:**
```bash
curl -X POST /api/classes/:classId/interactive \
  -H "Authorization: Bearer <token>" \
  -F "type=html" \
  -F "file=@simulador-excel.html"
```

**No nginx.conf**, o `client_max_body_size 64m;` já está configurado no bloco `location /api`.

---

## Compartilhamento entre React e HTML

Para páginas HTML que precisam se comunicar com o sistema (ex: registrar que o aluno concluiu):

```javascript
// Dentro do HTML do iframe
parent.postMessage({ type: 'INTERACTIVE_COMPLETE', data: { score: 100 } }, '*');
```

No React, o `InteractiveLessonPage` escuta:
```tsx
useEffect(() => {
  const handler = (e: MessageEvent) => {
    if (e.data?.type === 'INTERACTIVE_COMPLETE') {
      api.post(`/classes/${classId}/interactive/progress`, e.data.data);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);
```
