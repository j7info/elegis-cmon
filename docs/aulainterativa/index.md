# Módulo de Aula Interativa

Duas abordagens para criar telas interativas onde o aluno clica e interage:

| Abordagem | Quando usar | Exemplo |
|---|---|---|
| **React Components** | Interações simples, dados dinâmicos (vindos do banco), integração com o sistema | Grade clicável, quiz, hotspots |
| **HTML Embutido** | Simulações completas, interfaces complexas (Excel, Word), aulas offline | Planilha Excel simulada, Word toolbar, app custom |

O CLI gera o scaffolding de ambas.

---

## Sumário

- [Arquitetura](arquitetura.md) — DB, rotas, fluxo de dados
- [CLI — Script de Scaffolding](#cli-scaffolding)
- [Criando Telas](criando-telas.md) — passo a passo das duas abordagens
- [Hospedando HTMLs](criando-telas.md#upload-de-páginas-html) — upload e armazenamento
- [Exemplos](exemplos.md) — Excel, Word, hotspots

---

## CLI — Scaffolding

```bash
node scripts/criar-aula-interativa.mjs
```

### O que o prompt faz

Pergunta o nome, tipo, dados de configuração e gera automaticamente:

- **Migração SQL** com a tabela `interactive_lessons`
- **Rota backend** `GET/POST /api/classes/:classId/interactive`
- **Tela React** + rota no frontend
- **Ou** estrutura de pastas para HTML embutido

### Fluxo completo do terminal

```
$ node scripts/criar-aula-interativa.mjs

╔══════════════════════════════════════════╗
║       CRIAR AULA INTERATIVA             ║
╚══════════════════════════════════════════╝

? Nome da aula (ex: ExcelBasico): ExcelBasico
? Título da aula: Introdução ao Excel
? Abordagem:
  1. React Components — dados dinâmicos, integrado ao sistema
  2. HTML Embutido — simulação completa em HTML/CSS/JS
  > 2

? Caminho do arquivo HTML (ou deixe vazio para criar template): 
   (pode ser './meu-simulador-excel.html')
? Vai hospedar no servidor ou externo?
  1. Upload para o servidor (/api/uploads/interactive/)
  2. URL externa (qualquer link)
  > 1

✅ Scaffold gerado em:
   server/src/db/migrations/015_interactive_screens.sql
   server/src/routes/interactiveLessons.ts
   src/pages/InteractiveLesson_ExcelBasico.tsx
   src/components/interactive/ExcelBasico/
```

### Pré-requisitos

- Node.js 18+
- O script lê `.env.example` para saber caminhos do projeto
- Execute da raiz do projeto (`elegiscmon/`)
