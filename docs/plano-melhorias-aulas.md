# Plano — Melhorias na criação/edição de aulas

> Documento de planejamento. Decisões confirmadas com o usuário:
> pontuação **por aula**; CPF **mascarado na tela, completo no PDF exportado**;
> PDF de apresentação **salvo no servidor (upload)**.

## Contexto

A criação de aula dentro de um curso precisa de 4 ajustes:

1. **PDF de apresentação não aparece para anexar.** Hoje o botão "Apresentar PDF" só surge quando a aula está `active`, e o PDF é lido em memória na hora — nunca é salvo. O usuário espera anexar o PDF na **criação/edição** da aula; durante a apresentação os QR codes de presença aparecem no início, meio e fim (essa parte já existe em `PresentationViewer`).
2. **Esconder o CPF na coluna "Identificação"** da lista de alunos (na tela), e poder **exportar a lista em PDF**.
3. **Aluno cadastrado vira aluno definitivo do curso.** Na 2ª aula ele apenas reafirma presença (scan), não se recadastra. Hoje a lista de cada aula é por `class_id`, então a aula 2 aparece "vazia" mesmo havendo alunos do curso.
4. **Valores de pontuação configuráveis por aula** (hoje fixos 40/30/30), editáveis a qualquer momento — algumas aulas com ~50% de presença já são bom aproveitamento.

## Arquitetura relevante (já existente)

- DB Postgres, migrations em `server/src/db/migrations/00X_*.sql` rodadas por `server/src/db/migrate.ts` no start.
- Tabelas: `classes`, `registrations` (tem `class_id`, `course_id`, `UNIQUE(class_id, identifier)` e `UNIQUE(course_id, identifier)`), `attendances` (scan_start/middle/end).
- Scan de presença (`server/src/routes/attendances.ts`) **já valida inscrição em nível de CURSO** (`registrations WHERE course_id = ...`). Ou seja, quem se inscreveu pela aula 1 já consegue dar scan na aula 2.
- `upload.ts` (multer, dir `/app/uploads`, volume docker já montado) **existe mas não está conectado** a nenhuma rota; uploads não são servidos.
- Cliente HTTP `src/lib/api.ts` só faz JSON (sem multipart).
- Padrão de "PDF" no projeto = `window.print()` + `@media print` (ver `src/pages/PrintCertificate.tsx`). Sem libs de geração de PDF.

---

## Mudanças

### Migration 004 (`server/src/db/migrations/004_class_presentation_points.sql`)
```sql
ALTER TABLE classes ADD COLUMN IF NOT EXISTS presentation_url VARCHAR(500);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS points_start  INTEGER DEFAULT 40;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS points_middle INTEGER DEFAULT 30;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS points_end    INTEGER DEFAULT 30;
```
(Confirmar que `migrate.ts` aplica arquivos novos por ordem — seguir o padrão das migrations 002/003.)

### Feature A — PDF de apresentação salvo

**Backend**
- `server/src/index.ts`: servir uploads via `app.use('/api/uploads', express.static(UPLOAD_DIR))` **antes** do `app.use('/api', apiLimiter)` (evita rate-limit nos arquivos e reusa o proxy `/api` do nginx — sem mudança de roteamento).
- `server/src/routes/classes.ts`:
  - Importar `upload` de `../middleware/upload.js`.
  - Nova rota `POST /:id/presentation` (`authMiddleware`, `isCourseCreatorMiddleware`, `upload.single('file')`): valida `userCanAccessClass`, valida mimetype `application/pdf`, grava `presentation_url = '/api/uploads/' + req.file.filename` no `classes`, retorna a aula atualizada. (Opcional: remover arquivo antigo ao substituir.)
  - Em `POST /` (create) e `PUT /:id`: aceitar/persistir `points_*` (ver Feature D). O PDF é enviado em request separado após criar a aula (o create retorna o `id`).
  - `GET /:id` (whitelist pública): incluir `presentation_url` e `points_start/middle/end` no objeto retornado.
- **nginx.conf**: no `location /api`, adicionar `client_max_body_size 64m;` (hoje global é `2m`, bloquearia PDFs grandes).

**Frontend**
- `src/lib/api.ts`: adicionar método `upload(path, formData)` que faz `fetch` com `Authorization` mas **sem** `Content-Type` (deixa o browser definir o boundary).
- `src/pages/CourseDetail.tsx` (form "Nova Aula"): input `type=file` `accept=application/pdf`. Após `POST /classes`, se houver arquivo, chamar `api.upload('/classes/{id}/presentation', fd)`.
- `src/pages/ClassDetail.tsx`:
  - Modal de edição: input de PDF para anexar/substituir + mostrar nome/indicador do PDF atual; envia via `api.upload` ao salvar.
  - Botão "Apresentar": se `classData.presentation_url` existir, fazer `fetch` da URL → `blob` → `new File(...)` e abrir `PresentationViewer`; senão, manter o seletor de arquivo atual como fallback.
- `src/components/PresentationViewer.tsx`: **corrigir bug pré-existente** de camelCase — o componente lê `classData.qrStartAt`, `classData.qrDurationMinutes`, `a.scanStart/Middle/End`, `s.fullName`, mas a API devolve snake_case (`qr_start_at`, `qr_duration_minutes`, `scan_*`, `full_name`). Ajustar para snake_case (timer e "ao vivo" hoje quebrados). Usar `points_*` nos títulos.

### Feature B — Mascarar CPF na tela + exportar PDF

- Novo util `src/lib/format.ts` com `maskIdentifier(id)`: se contém `@` → mascara parte do local do email; senão (CPF) → mantém alguns dígitos e mascara o miolo (ex.: `123.***.***-09`).
- `src/pages/ClassDetail.tsx`: aplicar `maskIdentifier` na coluna "Identificação" (linha ~361). Aplicar também em `src/pages/CourseDetail.tsx` (lista "Desempenho Geral", linha ~225) para consistência na tela.
- `src/pages/ClassDetail.tsx`: botão **"Exportar PDF"** ao lado de "Exportar CSV". Implementar via `window.open` + `document.write` de uma tabela HTML estilizada + `window.print()` (padrão do projeto, zero dependência nova). O PDF mostra **CPF completo** (documento oficial), cabeçalho com curso/aula/data e os pesos de pontuação configurados. Manter o CSV existente.

### Feature C — Aluno definitivo do curso

- **Backend** `server/src/routes/courses.ts`: nova rota `GET /:id/students` (`authMiddleware` + `userCanAccessCourse`) → alunos distintos inscritos no curso:
  ```sql
  SELECT DISTINCT ON (identifier) identifier, full_name, role, department
  FROM registrations WHERE course_id = $1 ORDER BY identifier, created_at;
  ```
- **Backend** `server/src/routes/registrations.ts` (cadastro público por aula): mudar o `ON CONFLICT` para `(course_id, identifier) DO UPDATE` (em vez de `(class_id, identifier)`), garantindo **uma linha por aluno no curso** e evitando conflito com a constraint `unique_course_identifier` quando o aluno se cadastra por aulas diferentes.
- **Frontend** `src/pages/ClassDetail.tsx`: em `loadData`, trocar a fonte da lista de `GET /classes/{id}/registrations` para `GET /courses/{course_id}/students` (usa `classData.course_id`). A tabela passa a listar **todos os alunos do curso**, cruzando com `attendances` desta aula por `identifier`. O contador "X de Y", o gráfico, o CSV e o PDF passam a usar essa lista. (Scan já funciona em nível de curso — nenhuma mudança no fluxo de presença.)

### Feature D — Pontuação configurável por aula

- **Backend** `server/src/routes/classes.ts`: `POST /` e `PUT /:id` aceitam `points_start/middle/end` (default 40/30/30 no create; conditional set-clauses no update, seguindo o padrão já existente). `GET /:id` retorna os três campos.
- **Backend** `server/src/routes/certificates.ts` (`GET /report/:courseId`): a agregação passa a usar os pesos de cada aula —
  ```sql
  ... SUM(CASE WHEN a.scan_start IS NOT NULL THEN c.points_start ELSE 0 END) + ...
  FROM attendances a JOIN classes c ON a.class_id = c.id WHERE a.class_id = ANY($1) ...
  ```
  e `totalPossiblePoints = SELECT SUM(points_start+points_middle+points_end) FROM classes WHERE course_id = $1` (em vez de `classIds.length * 100`). `percentage`/`approved` (≥75%) recalculados sobre esse total.
- **Frontend** `src/pages/CourseDetail.tsx`: 3 inputs numéricos (Início/Meio/Fim, default 40/30/30) no form de nova aula, enviados no `POST /classes`.
- **Frontend** `src/pages/ClassDetail.tsx`: substituir os `40/30/30` hardcoded (títulos dos `QRCard`, cabeçalhos da tabela, cálculo do total, CSV, PDF, dados do gráfico) por `classData.points_start/middle/end`. Adicionar um editor inline de pontuação (no padrão do bloco "Duração QR" já existente), disponível quando `status !== 'completed'`, salvando via `PUT /classes/{id}`.
- **Frontend** `src/components/PresentationViewer.tsx`: títulos dos QR usando `points_*`.

---

## Arquivos tocados (resumo)
- **Novos:** `server/src/db/migrations/004_class_presentation_points.sql`, `src/lib/format.ts`
- **Backend:** `server/src/index.ts`, `server/src/routes/classes.ts`, `server/src/routes/courses.ts`, `server/src/routes/registrations.ts`, `server/src/routes/certificates.ts`, `nginx.conf`
- **Frontend:** `src/lib/api.ts`, `src/pages/CourseDetail.tsx`, `src/pages/ClassDetail.tsx`, `src/components/PresentationViewer.tsx`

## Verificação (end-to-end)
1. Rodar migration (start do backend) e conferir colunas novas em `classes`.
2. **Criar aula** com PDF anexo + pontuação custom (ex.: 50/25/25) → confirmar `presentation_url` e `points_*` salvos; arquivo acessível em `/api/uploads/...`.
3. **Editar aula**: trocar PDF e alterar pontuação; confirmar persistência.
4. **Apresentar**: iniciar aula, abrir "Apresentar" → PDF salvo carrega; QR início/meio/fim aparecem; timer e painel "ao vivo" funcionando (bug camelCase corrigido).
5. **Aluno definitivo**: cadastrar aluno na aula 1; criar aula 2 → o aluno aparece na lista da aula 2 e consegue dar scan sem recadastro.
6. **CPF**: na tela a coluna Identificação aparece mascarada; "Exportar PDF" gera lista com CPF completo. "Exportar CSV" segue funcionando.
7. **Pontuação no certificado**: `GET /certificates/report/:courseId` reflete os pesos por aula e o % recalculado sobre o total real.
8. `npm run lint` (tsc) sem erros no front; build do server OK.
