#!/usr/bin/env node

/**
 * Scaffold: Aula Interativa
 *
 * Uso:
 *   node scripts/criar-aula-interativa.mjs
 *
 * Gera:
 *   - Migracao SQL
 *   - Rota backend
 *   - Pagina + componente React  (abordagem 1)
 *   - Ou template HTML + upload  (abordagem 2)
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Prompter (buffers all stdin lines upfront) ────────────────

let _stdinLines = null;
async function stdinLine(idx) {
  if (!_stdinLines) {
    const buf = await new Promise(resolve => {
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data));
    });
    _stdinLines = buf.split('\n').map(s => s.trim());
  }
  return _stdinLines[idx] || '';
}

let _inputIdx = 0;
function ask(query) {
  process.stdout.write(query);
  return stdinLine(_inputIdx++);
}

async function select(query, options) {
  console.log('');
  console.log(query);
  options.forEach((o, i) => console.log('  ' + (i + 1) + '. ' + o));
  const answer = await ask('  (1-' + options.length + '): ');
  const idx = parseInt(answer, 10) - 1;
  return idx >= 0 && idx < options.length ? idx : 0;
}

function close() { /* stdin already consumed */ }

function kebab(str) {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/[^a-z0-9-]/g, '');
}

function pascal(str) {
  return str
    .replace(/[-_ ]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, c => c.toUpperCase());
}

// ── Templates (usando array join para evitar conflito de backticks) ──

function migrationSQL() {
  return [
    '-- Migration XXX: Interactive Screens',
    '-- Adiciona suporte a aulas interativas (React components + HTML embutido)',
    '',
    'CREATE TABLE IF NOT EXISTS interactive_lessons (',
    '  id         SERIAL PRIMARY KEY,',
    '  class_id   INTEGER REFERENCES classes(id) ON DELETE CASCADE,',
    "  type       VARCHAR(10) NOT NULL CHECK (type IN ('react', 'html')),",
    '',
    '  -- Abordagem React: definicao completa da tela (elementos, layout, dados)',
    '  definition JSONB,',
    '',
    '  -- Abordagem HTML: URL externa ou conteudo inline',
    '  html_url      VARCHAR(500),',
    '  html_content  TEXT,',
    '',
    '  created_at TIMESTAMPTZ DEFAULT NOW(),',
    '  updated_at TIMESTAMPTZ DEFAULT NOW(),',
    '',
    '  UNIQUE(class_id)',
    ');',
    '',
    '-- Log de interacoes do aluno (opcional)',
    'CREATE TABLE IF NOT EXISTS interactive_lesson_logs (',
    '  id             SERIAL PRIMARY KEY,',
    '  lesson_id      INTEGER REFERENCES interactive_lessons(id) ON DELETE CASCADE,',
    '  identifier     VARCHAR(255) NOT NULL,',
    '  action         VARCHAR(100) NOT NULL,',
    '  payload        JSONB,',
    '  created_at     TIMESTAMPTZ DEFAULT NOW()',
    ');',
    '',
    'CREATE INDEX IF NOT EXISTS idx_interactive_logs_lesson ON interactive_lesson_logs(lesson_id);',
    'CREATE INDEX IF NOT EXISTS idx_interactive_logs_identifier ON interactive_lesson_logs(identifier);',
    '',
  ].join('\n');
}

function routeTS() {
  return [
    "import { Router, Request, Response } from 'express';",
    "import pool from '../db/pool.js';",
    "import { authMiddleware, AuthRequest } from '../middleware/auth.js';",
    "import { userCanAccessClass } from './classes.js';",
    "import { upload } from '../middleware/upload.js';",
    '',
    'const router = Router();',
    '',
    '// --- Buscar config da aula interativa ---',
    '',
    "router.get('/:classId/interactive', async (req: Request, res: Response) => {",
    '  try {',
    '    const { classId } = req.params;',
    "    const result = await pool.query(",
    "      'SELECT * FROM interactive_lessons WHERE class_id = $1',",
    '      [classId]',
    '    );',
    "    if (result.rows.length === 0) {",
    "      return res.status(404).json({ error: 'Aula interativa nao configurada' });",
    '    }',
    '    res.json(result.rows[0]);',
    '  } catch (err) {',
    "    console.error('GET /classes/:id/interactive error:', err);",
    "    res.status(500).json({ error: 'Erro ao buscar aula interativa' });",
    '  }',
    '});',
    '',
    '// --- Criar / substituir config ---',
    '',
    "router.post('/:classId/interactive', authMiddleware, async (req: AuthRequest, res: Response) => {",
    '  try {',
    '    const { classId } = req.params;',
    '    const canAccess = await userCanAccessClass(req.user!.id, Number(classId));',
    "    if (!canAccess) return res.sendStatus(403);",
    '',
    '    const { type, definition, html_url, html_content } = req.body;',
    '',
    '    const result = await pool.query(',
    "      'INSERT INTO interactive_lessons (class_id, type, definition, html_url, html_content) ' +",
    "      'VALUES ($1, $2, $3, $4, $5) ' +",
    "      'ON CONFLICT (class_id) ' +",
    "      'DO UPDATE SET type = $2, definition = $3, html_url = $4, html_content = $5, updated_at = NOW() ' +",
    "      'RETURNING *',",
    '      [classId, type, definition ?? null, html_url ?? null, html_content ?? null]',
    '    );',
    '',
    '    res.json(result.rows[0]);',
    '  } catch (err) {',
    "    console.error('POST /classes/:id/interactive error:', err);",
    "    res.status(500).json({ error: 'Erro ao salvar aula interativa' });",
    '  }',
    '});',
    '',
    '// --- Upload de HTML ---',
    '',
    'router.post(',
    "  '/:classId/interactive/upload',",
    '  authMiddleware,',
    "  upload.single('file'),",
    '  async (req: AuthRequest, res: Response) => {',
    '    try {',
    '      const { classId } = req.params;',
    '      const canAccess = await userCanAccessClass(req.user!.id, Number(classId));',
    "      if (!canAccess) return res.sendStatus(403);",
    '',
    "      if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });",
    '',
    "      const html_url = '/api/uploads/' + req.file.filename;",
    '',
    '      const result = await pool.query(',
    "        'INSERT INTO interactive_lessons (class_id, type, html_url) ' +",
    "        'VALUES ($1, $2, $3) ' +",
    "        'ON CONFLICT (class_id) ' +",
    "        'DO UPDATE SET type = $2, html_url = $3, updated_at = NOW() ' +",
    "        'RETURNING *',",
    '        [classId, html_url]',
    '      );',
    '',
    '      res.json(result.rows[0]);',
    '    } catch (err) {',
    "      console.error('POST /classes/:id/interactive/upload error:', err);",
    "      res.status(500).json({ error: 'Erro ao fazer upload' });",
    '    }',
    '  }',
    ');',
    '',
    '// --- Remover config ---',
    '',
    "router.delete('/:classId/interactive', authMiddleware, async (req: AuthRequest, res: Response) => {",
    '  try {',
    '    const { classId } = req.params;',
    '    const canAccess = await userCanAccessClass(req.user!.id, Number(classId));',
    "    if (!canAccess) return res.sendStatus(403);",
    '',
    "    await pool.query('DELETE FROM interactive_lessons WHERE class_id = $1', [classId]);",
    '    res.sendStatus(204);',
    '  } catch (err) {',
    "    console.error('DELETE /classes/:id/interactive error:', err);",
    "    res.status(500).json({ error: 'Erro ao remover aula interativa' });",
    '  }',
    '});',
    '',
    'export default router;',
    '',
  ].join('\n');
}

function pageReactTSX(slug, nome) {
  return [
    "import { useEffect, useState } from 'react';",
    "import { useParams } from 'react-router-dom';",
    "import { api } from '../lib/api';",
    "import { InteractiveGrid } from '../components/interactive/InteractiveGrid';",
    "import { Loader2, AlertCircle } from 'lucide-react';",
    '',
    'interface InteractiveLesson {',
    '  id: number;',
    '  class_id: number;',
    "  type: 'react' | 'html';",
    '  definition: any;',
    '  html_url?: string;',
    '  html_content?: string;',
    '}',
    '',
    'export function InteractiveLesson_' + nome + '() {',
    "  const { classId } = useParams<{ classId: string }>();",
    '  const [lesson, setLesson] = useState<InteractiveLesson | null>(null);',
    '  const [loading, setLoading] = useState(true);',
    '  const [error, setError] = useState<string | null>(null);',
    '',
    '  useEffect(() => {',
    '    if (!classId) return;',
    '    setLoading(true);',
    "    api.get<InteractiveLesson>('/classes/' + classId + '/interactive')",
    '      .then(data => {',
    '        setLesson(data);',
    '        setLoading(null);',
    '      })',
    '      .catch(err => {',
    '        setError(err.message);',
    '        setLoading(false);',
    '      });',
    '  }, [classId]);',
    '',
    '  if (loading) {',
    '    return (',
    '      <div className="flex items-center justify-center min-h-screen">',
    '        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />',
    '      </div>',
    '    );',
    '  }',
    '',
    '  if (error) {',
    '    return (',
    '      <div className="flex items-center justify-center min-h-screen text-red-600 gap-2">',
    '        <AlertCircle className="w-6 h-6" />',
    '        <span>{error}</span>',
    '      </div>',
    '    );',
    '  }',
    '',
    '  if (!lesson) {',
    '    return (',
    '      <div className="flex items-center justify-center min-h-screen text-gray-500">',
    "        Aula interativa nao encontrada.",
    '      </div>',
    '    );',
    '  }',
    '',
    "  if (lesson.type === 'html') {",
    '    const src = lesson.html_content',
    "      ? 'data:text/html;charset=utf-8,' + encodeURIComponent(lesson.html_content)",
    '      : lesson.html_url;',
    '',
    '    return (',
    '      <div className="w-full h-screen">',
    '        <iframe',
    '          src={src}',
    '          className="w-full h-full border-none"',
    '          title="Aula Interativa"',
    '          sandbox="allow-scripts allow-same-origin allow-popups"',
    '        />',
    '      </div>',
    '    );',
    '  }',
    '',
    '  // React-based: renderiza grid generico',
    '  return (',
    '    <div className="min-h-screen bg-gray-50 p-8">',
    '      <h1 className="text-2xl font-bold mb-4">{lesson.definition?.title || "Aula Interativa"}</h1>',
    '      <InteractiveGrid definition={lesson.definition} />',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');
}

function gridComponentTSX() {
  return [
    "import { useState } from 'react';",
    "import { X } from 'lucide-react';",
    '',
    'interface CellInfo {',
    '  title: string;',
    '  description: string;',
    '}',
    '',
    'interface GridCell {',
    '  value: string;',
    '  info?: CellInfo;',
    '}',
    '',
    'interface GridDefinition {',
    '  columns: string[];',
    '  rows: GridCell[][];',
    '  title?: string;',
    '}',
    '',
    'export function InteractiveGrid({ definition }: { definition: GridDefinition }) {',
    '  const [selected, setSelected] = useState<{ cell: GridCell; row: number; col: number } | null>(null);',
    '',
    "  if (!definition?.columns || !definition?.rows) {",
    '    return <p className="text-gray-500">Definicao invalida.</p>;',
    '  }',
    '',
    '  return (',
    '    <div>',
    '      <p className="text-gray-600 mb-4">Clique em qualquer celula para saber mais.</p>',
    '',
    '      <div className="overflow-x-auto bg-white rounded-lg shadow border">',
    '        <table className="w-full border-collapse">',
    '          <thead>',
    '            <tr className="bg-blue-600 text-white">',
    '              <th className="border px-3 py-2 text-left text-sm font-medium w-10">#</th>',
    '              {definition.columns.map((col, i) => (',
    '                <th key={i} className="border px-3 py-2 text-left text-sm font-medium">',
    '                  {col}',
    '                </th>',
    '              ))}',
    '            </tr>',
    '          </thead>',
    '          <tbody>',
    '            {definition.rows.map((row, ri) => (',
    '              <tr key={ri} className="hover:bg-blue-50 transition-colors">',
    '                <td className="border px-3 py-2 text-xs text-gray-400 bg-gray-50 text-center">{ri + 1}</td>',
    '                {row.map((cell, ci) => (',
    '                  <td',
    '                    key={ci}',
    '                    className={"border px-3 py-2 text-sm cursor-pointer transition-all " +',
    '                      (selected?.row === ri && selected?.col === ci ? "bg-blue-100 ring-2 ring-blue-400" : "hover:bg-blue-100")',
    '                    }',
    '                    onClick={() => setSelected({ cell, row: ri, col: ci })}',
    '                  >',
    '                    {cell.value}',
    '                  </td>',
    '                ))}',
    '              </tr>',
    '            ))}',
    '          </tbody>',
    '        </table>',
    '      </div>',
    '',
    '      {/* Modal de info */}',
    '      {selected && (',
    '        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelected(null)}>',
    '          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>',
    '            <div className="flex items-start justify-between mb-4">',
    '              <h2 className="text-lg font-semibold">',
    '                {selected.cell.info?.title || "Celula " + definition.columns[selected.col] + " " + (selected.row + 1)}',
    '              </h2>',
    '              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">',
    '                <X className="w-5 h-5" />',
    '              </button>',
    '            </div>',
    '            <p className="text-gray-600">',
    '              {selected.cell.info?.description || "Sem descricao para esta celula."}',
    '            </p>',
    '            <p className="text-xs text-gray-400 mt-4">',
    '              Linha {selected.row + 1}, Coluna {definition.columns[selected.col]}',
    '            </p>',
    '          </div>',
    '        </div>',
    '      )}',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');
}

function templateHTML(slug, titulo) {
  return '<!DOCTYPE html>\n' +
    '<html lang="pt-BR">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8" />\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
    '  <title>' + titulo + '</title>\n' +
    '  <style>\n' +
    '    * { margin: 0; padding: 0; box-sizing: border-box; }\n' +
    '    body {\n' +
    '      font-family: "Segoe UI", system-ui, sans-serif;\n' +
    '      background: #f8f9fa;\n' +
    '      color: #1a1a2e;\n' +
    '      display: flex;\n' +
    '      flex-direction: column;\n' +
    '      min-height: 100vh;\n' +
    '    }\n' +
    '    header {\n' +
    '      background: linear-gradient(135deg, #1a1a2e, #16213e);\n' +
    '      color: #fff;\n' +
    '      padding: 20px 32px;\n' +
    '      text-align: center;\n' +
    '    }\n' +
    '    header h1 { font-size: 1.5rem; font-weight: 600; }\n' +
    '    header p { font-size: 0.875rem; opacity: 0.8; margin-top: 4px; }\n' +
    '    main {\n' +
    '      flex: 1;\n' +
    '      display: flex;\n' +
    '      align-items: center;\n' +
    '      justify-content: center;\n' +
    '      padding: 32px;\n' +
    '    }\n' +
    '    .placeholder {\n' +
    '      text-align: center;\n' +
    '      max-width: 480px;\n' +
    '      padding: 48px 32px;\n' +
    '      background: #fff;\n' +
    '      border-radius: 16px;\n' +
    '      box-shadow: 0 4px 24px rgba(0,0,0,0.06);\n' +
    '    }\n' +
    '    .placeholder h2 { font-size: 1.25rem; margin-bottom: 12px; }\n' +
    '    .placeholder p { color: #6c757d; line-height: 1.6; }\n' +
    '    .btn {\n' +
    '      display: inline-block;\n' +
    '      margin-top: 24px;\n' +
    '      padding: 10px 24px;\n' +
    '      background: #1a1a2e;\n' +
    '      color: #fff;\n' +
    '      border: none;\n' +
    '      border-radius: 8px;\n' +
    '      font-size: 0.875rem;\n' +
    '      cursor: pointer;\n' +
    '      transition: background 0.2s;\n' +
    '    }\n' +
    '    .btn:hover { background: #16213e; }\n' +
    '    .info-box {\n' +
    '      position: fixed;\n' +
    '      bottom: 24px;\n' +
    '      right: 24px;\n' +
    '      max-width: 320px;\n' +
    '      background: #fff;\n' +
    '      border: 1px solid #dee2e6;\n' +
    '      border-radius: 12px;\n' +
    '      padding: 16px;\n' +
    '      box-shadow: 0 8px 32px rgba(0,0,0,0.1);\n' +
    '      display: none;\n' +
    '    }\n' +
    '    .info-box.visible { display: block; }\n' +
    '    .info-box h3 { font-size: 0.875rem; margin-bottom: 4px; }\n' +
    '    .info-box p { font-size: 0.8125rem; color: #6c757d; }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <header>\n' +
    '    <h1>' + titulo + '</h1>\n' +
    '    <p>Aula interativa — clique nos elementos para explorar</p>\n' +
    '  </header>\n' +
    '\n' +
    '  <main>\n' +
    "    <div class=\"placeholder\" onclick=\"mostrarInfo('Bem-vindo!', 'Este e um template inicial. Edite este HTML para criar sua simulacao interativa — como uma planilha Excel, interface do Word, mapa clicavel, etc.')\">\n" +
    '      <h2>🔨 Area Interativa</h2>\n' +
    '      <p>Substitua este conteudo pelo seu simulador.<br />\n' +
    '         Clique em qualquer lugar para ver um exemplo.</p>\n' +
    "      <button class=\"btn\" onclick=\"event.stopPropagation(); mostrarInfo('Exemplo', 'Voce pode criar botoes, tabelas, graficos e muito mais. Tudo em HTML, CSS e JavaScript puro.')\">\n" +
    '        Saiba mais\n' +
    '      </button>\n' +
    '    </div>\n' +
    '  </main>\n' +
    '\n' +
    '  <div class="info-box" id="infoBox">\n' +
    '    <h3 id="infoTitle"></h3>\n' +
    '    <p id="infoDesc"></p>\n' +
    '  </div>\n' +
    '\n' +
    '  <script>\n' +
    '    function mostrarInfo(title, desc) {\n' +
    "      document.getElementById('infoTitle').textContent = title;\n" +
    "      document.getElementById('infoDesc').textContent = desc;\n" +
    "      const box = document.getElementById('infoBox');\n" +
    "      box.classList.add('visible');\n" +
    "      setTimeout(() => box.classList.remove('visible'), 5000);\n" +
    '    }\n' +
    '  </script>\n' +
    '</body>\n' +
    '</html>\n';
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       CRIAR AULA INTERATIVA             ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  const nome = await ask('? Nome da aula (ex: ExcelBasico): ');
  if (!nome) { console.log('  Nome obrigatorio.'); close(); process.exit(1); }

  const titulo = await ask('? Titulo da aula: ') || nome;
  const slug = kebab(nome);
  const nomePascal = pascal(nome);

  const abordagemIdx = await select('? Abordagem:', [
    'React Components — dados dinâmicos, integrado ao sistema',
    'HTML Embutido — simulacao completa em HTML/CSS/JS',
  ]);

  const isReact = abordagemIdx === 0;
  const isHtml = abordagemIdx === 1;

  let rotaPublica = false;
  let slugRota = slug;

  if (isReact) {
    const resp = await ask('? Precisa de rota publica? (s/N): ');
    rotaPublica = resp.toLowerCase() === 's';

    if (rotaPublica) {
      slugRota = await ask('? Slug da rota (ex: aula-interativa): ') || slug;
    }

    const cols = await ask('? Colunas da grade (separadas por virgula): ');
    const colunas = cols ? cols.split(',').map(s => s.trim()).filter(Boolean) : ['Coluna A', 'Coluna B', 'Coluna C'];
  }

  let htmlPath = '';
  if (isHtml) {
    htmlPath = await ask('? Caminho do arquivo HTML (ou vazio para criar template): ');
  }

  console.log('');
  console.log('  Gerando scaffolding...\n');

  // ─── 1. Migration ──────────────────────────────────────────
  const migrationsDir = resolve(ROOT, 'server/src/db/migrations');
  const migrationFiles = existsSync(migrationsDir) ? readdirSync(migrationsDir).filter(f => f.endsWith('.sql')) : [];
  const nextNum = String(migrationFiles.length + 1).padStart(3, '0');

  const migrationPath = resolve(migrationsDir, nextNum + '_interactive_screens.sql');
  if (existsSync(migrationsDir)) {
    writeFileSync(migrationPath, migrationSQL());
    console.log('  ✅ ' + migrationPath);
  } else {
    console.log('  ⚠️  Diretorio de migrations nao encontrado, pulando...');
  }

  // ─── 2. Rota backend ───────────────────────────────────────
  const routesDir = resolve(ROOT, 'server/src/routes');
  const routePath = resolve(routesDir, 'interactiveLessons.ts');
  if (existsSync(routesDir)) {
    writeFileSync(routePath, routeTS());
    console.log('  ✅ ' + routePath);
  } else {
    console.log('  ⚠️  Diretorio de rotas nao encontrado, pulando...');
  }

  // ─── 3. Frontend ───────────────────────────────────────────
  const componentsDir = resolve(ROOT, 'src/components/interactive');
  if (!existsSync(componentsDir)) mkdirSync(componentsDir, { recursive: true });

  const pagesDir = resolve(ROOT, 'src/pages');

  if (isReact) {
    const pagePath = resolve(pagesDir, 'InteractiveLesson_' + nomePascal + '.tsx');
    writeFileSync(pagePath, pageReactTSX(slugRota, nomePascal));
    console.log('  ✅ ' + pagePath);

    const gridPath = resolve(componentsDir, 'InteractiveGrid.tsx');
    if (!existsSync(gridPath)) {
      writeFileSync(gridPath, gridComponentTSX());
      console.log('  ✅ ' + gridPath);
    }

    const compDir = resolve(componentsDir, nomePascal);
    if (!existsSync(compDir)) mkdirSync(compDir, { recursive: true });
    console.log('  ✅ ' + compDir + '/ (pasta do componente)');
  }

  if (isHtml) {
    const pagePath = resolve(pagesDir, 'InteractiveLessonPage.tsx');
    if (!existsSync(pagePath)) {
      writeFileSync(pagePath, pageReactTSX(slugRota, 'Page'));
      console.log('  ✅ ' + pagePath + ' (pagina generica)');
    }

    if (!htmlPath) {
      const htmlDir = resolve(ROOT, 'aulas-interativas', slug);
      if (!existsSync(htmlDir)) mkdirSync(htmlDir, { recursive: true });
      const htmlFile = resolve(htmlDir, 'index.html');
      writeFileSync(htmlFile, templateHTML(slug, titulo));
      console.log('  ✅ ' + htmlFile + ' (template inicial)');
      console.log('  📝 Edite o HTML para criar sua simulacao!');
      console.log('  📦 Para publicar: zip -r ' + slug + '.zip ' + slug + '/');
    }
  }

  // ─── 4. Instrucao final ─────────────────────────────────────
  console.log('');
  console.log('  ✅ Scaffold concluido!');
  console.log('');
  console.log('  PROXIMOS PASSOS:');
  console.log('');

  if (isReact) {
    console.log('  1. Edite a definicao da grade em src/components/interactive/');
    console.log('  2. Adicione a rota em src/App.tsx:');
    console.log('     import { InteractiveLesson_' + nomePascal + " } from './pages/InteractiveLesson_" + nomePascal + "';");
    if (rotaPublica) {
      console.log('     <Route path="/interativa/' + slugRota + '" element={<InteractiveLesson_' + nomePascal + ' />} />');
    }
    console.log('  3. Conecte a aula desejada no backend');
  }

  if (isHtml) {
    console.log('  1. Edite o HTML em aulas-interativas/ para criar sua simulacao');
    console.log('  2. Teste abrindo o HTML diretamente no navegador');
    console.log('  3. Faca upload do zip via API ou admin');
    console.log('  4. Associe a uma aula pelo painel');
  }

  console.log('');
  console.log('  📖 Leia a documentacao completa em docs/aulainterativa/');
  console.log('');

  close();
}

main().catch(err => { close(); console.error(err); });
