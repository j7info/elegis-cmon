# Criando Telas Interativas

## Abordagem 1: React Components

Para telas que usam dados do próprio sistema (alunos, notas, etc.) ou interações mais simples.

### Estrutura de arquivos

```
src/
  components/
    interactive/
      <NomeDaAula>/
        definition.ts    — config JSON da tela
        GridInterativa.tsx  — grade clicável
        HotspotImage.tsx    — imagem com zonas clicáveis
        InfoModal.tsx       — modal de informação
  pages/
    InteractiveLesson_<NomeDaAula>.tsx  — página que carrega os componentes
```

### Passo a passo

**1. Defina o layout e elementos**

`src/components/interactive/ExcelBasico/definition.ts`

```typescript
export interface CellInfo {
  title: string;
  description: string;
  highlight?: boolean;
}

export interface GridCell {
  row: number;
  col: number;
  value: string;
  info: CellInfo;
}

export const DEFINITION = {
  id: 'excel-basico',
  title: 'Introdução ao Excel — Planilha Interativa',
  type: 'grid' as const,
  columns: ['Nome', 'Cargo', 'Depto', 'Salário', 'Bônus', 'Total'],
  rows: [
    [
      { value: 'João', info: { title: 'João Silva', description: 'Funcionário do setor administrativo' } },
      { value: 'Analista', info: { title: 'Cargo', description: 'Cargo efetivo, nível III' } },
      { value: 'CPDTI', info: { title: 'Departamento', description: 'Coordenação de TI' } },
      { value: 'R$ 5.000', info: { title: 'Salário Base', description: 'Valor sem acréscimos' } },
      { value: 'R$ 500', info: { title: 'Bônus', description: 'Bônus por produtividade' } },
      { value: 'R$ 5.500', info: { title: 'Total', description: 'Salário + Bônus = R$ 5.500,00' } },
    ],
    // ... mais linhas
  ],
};
```

**2. Crie a página da aula interativa**

`src/pages/InteractiveLesson_ExcelBasico.tsx`

```tsx
import { useState } from 'react';
import { DEFINITION } from '../components/interactive/ExcelBasico/definition';
import { InfoModal } from '../components/interactive/ExcelBasico/InfoModal';

export function InteractiveLesson_ExcelBasico() {
  const [selectedCell, setSelectedCell] = useState(null);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-6">{DEFINITION.title}</h1>
      <p className="text-gray-600 mb-4">
        Clique em qualquer célula para saber mais sobre o dado.
      </p>

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-blue-600 text-white">
              {DEFINITION.columns.map((col, i) => (
                <th key={i} className="border px-4 py-2 text-left font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEFINITION.rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-blue-50">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="border px-4 py-2 cursor-pointer transition-colors hover:bg-blue-100"
                    onClick={() => setSelectedCell(cell)}
                  >
                    {cell.value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedCell && (
        <InfoModal
          cell={selectedCell}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </div>
  );
}
```

**3. Adicione a rota em `App.tsx`**

```tsx
import { InteractiveLesson_ExcelBasico } from './pages/InteractiveLesson_ExcelBasico';

// Dentro do <Routes>
<Route path="/interativa/excel-basico" element={<InteractiveLesson_ExcelBasico />} />
```

---

## Abordagem 2: HTML Embutido (mais flexível)

Permite criar simulações completas em HTML/CSS/JS puro (ou mesmo PHP gerando HTML estático). O sistema carrega num iframe.

### Fluxo de criação

```
1. Crie o HTML da simulação (pode usar qualquer ferramenta — até mesmo
   gerar via PHP e exportar como .html estático)

2. Faça upload para o servidor (ou aponte para URL externa)

3. Associe a uma aula pelo painel admin

4. Aluno acessa a aula → iframe com a simulação
```

### Upload de páginas HTML

**Via painel admin** (futuro):
- Na edição da aula, seção "Aula Interativa"
- Selecionar tipo "HTML"
- Arrastar arquivo .html + assets (.css, .js, imagens)
- Upload empacota tudo numa pasta com slug único

**Via CLI:**
```bash
curl -X POST /api/classes/42/interactive \
  -H "Authorization: Bearer eyJ..." \
  -F "type=html" \
  -F "file=@aula-excel.zip" \
  -F "entry=index.html"
```

O servidor descompacta em `/app/uploads/interactive/<slug>/` e salva `html_url = "/api/uploads/interactive/<slug>/index.html"`.

### Estrutura esperada para upload zip

```
simulador-excel.zip
├── index.html          ← entry point
├── style.css
├── script.js
└── assets/
    ├── logo.png
    └── icon.svg
```

### Template mínimo (`index.html`)

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simulador Excel</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #f3f2f1; }
    .toolbar { background: #e1dfdd; padding: 8px; display: flex; gap: 4px; }
    .toolbar button {
      padding: 6px 12px; border: none; background: #fff;
      border-radius: 4px; cursor: pointer; font-size: 13px;
    }
    .toolbar button:hover { background: #d0d0d0; }
    .toolbar button.active { background: #217346; color: #fff; }
    table { width: 100%; border-collapse: collapse; }
    td, th {
      border: 1px solid #d0d0d0; padding: 4px 8px;
      min-width: 80px; height: 24px; font-size: 13px;
    }
    td { cursor: pointer; }
    td:hover { background: #e5f0ff; }
    .info-box {
      position: fixed; bottom: 20px; right: 20px;
      background: #fff; border: 1px solid #217346;
      border-radius: 8px; padding: 16px; max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: none;
    }
    .info-box.visible { display: block; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="clickBtn(this, 'Novo arquivo em branco')">📄 Novo</button>
    <button onclick="clickBtn(this, 'Ctrl+A — Seleciona tudo')">✂️ Recortar</button>
    <button onclick="clickBtn(this, 'Ctrl+C — Copia seleção')">📋 Copiar</button>
    <button onclick="clickBtn(this, 'Ctrl+V — Cola conteúdo')">📌 Colar</button>
    <button onclick="clickBtn(this, 'Aplica formatação de moeda')">💰 Formatar</button>
  </div>

  <table id="sheet">
    <thead><tr>
      <th></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th>
    </tr></thead>
    <tbody id="grid"></tbody>
  </table>

  <div class="info-box" id="infoBox"></div>

  <script>
    const data = [
      ['Nome', 'Cargo', 'Depto', 'Salário', 'Bônus'],
      ['João', 'Analista', 'CPDTI', '5000', '500'],
      ['Maria', 'Gerente', 'GAB10', '8000', '1000'],
      ['Carlos', 'Técnico', 'CPDTI', '3500', '300'],
    ];

    const info = {
      '1:0': 'Título da coluna — identifica os campos',
      '1:1': 'Título da coluna — identifica os campos',
      '2:0': 'João Silva, funcionário desde 2019',
      '2:1': 'Cargo: Analista de Sistemas, nível III',
      '2:2': 'Departamento: Coordenação de TI',
      '2:3': 'Salário base: R$ 5.000,00',
      '2:4': 'Bônus: R$ 500,00 (10% de produtividade)',
      '3:0': 'Maria Souza, líder de equipe',
      '3:1': 'Cargo: Gerente Administrativa',
      '3:3': 'Salário base: R$ 8.000,00',
      '4:2': 'Departamento: Coordenação de TI',
    };

    function buildGrid() {
      const tbody = document.getElementById('grid');
      for (let r = 0; r < data.length; r++) {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = r + 1;
        tr.appendChild(th);
        for (let c = 0; c < data[r].length; c++) {
          const td = document.createElement('td');
          td.textContent = data[r][c];
          td.dataset.row = r + 1;
          td.dataset.col = c;
          td.addEventListener('click', () => showInfo(r + 1, c));
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }

    function showInfo(row, col) {
      const key = row + ':' + col;
      const box = document.getElementById('infoBox');
      const text = info[key] || `Célula ${String.fromCharCode(65 + col)}${row}`;
      box.innerHTML = `<strong>${String.fromCharCode(65 + col)}${row}</strong><p>${text}</p>`;
      box.classList.add('visible');
    }

    function clickBtn(btn, msg) {
      document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const box = document.getElementById('infoBox');
      box.innerHTML = `<strong>${btn.textContent.trim()}</strong><p>${msg}</p>`;
      box.classList.add('visible');
    }

    buildGrid();
  </script>
</body>
</html>
```

---

## Abordagem Híbrida

Páginas HTML podem se comunicar com o sistema React via `postMessage`:

**No HTML:**
```js
// Quando o aluno completa a interação
parent.postMessage({
  type: 'LESSON_PROGRESS',
  payload: { action: 'clicked_cell', cell: 'B3', timestamp: Date.now() }
}, '*');
```

**No React (InteractiveLessonPage escuta):**
```tsx
useEffect(() => {
  const handler = (e: MessageEvent) => {
    if (e.data?.type === 'LESSON_PROGRESS') {
      api.post(`/classes/${classId}/interactive/log`, e.data.payload);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);
```

Isso permite registrar em quais células o aluno clicou, quanto tempo levou, etc.
