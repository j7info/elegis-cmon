# Exemplos de Telas Interativas

## 1. Planilha Excel Interativa

### Abordagem: HTML Embutido

Simulação completa de uma planilha Excel com células clicáveis e barra de ferramentas.

```
aulas-interativas/
  excel-basico/
    index.html     ← entry point
    style.css
    script.js
```

**Funcionalidades:**
- Grade 10x6 com cabeçalhos A-F e linhas numeradas
- Cada célula mostra descrição ao clicar
- Toolbar com botões Novos, Recortar, Copiar, Colar, Formatas
- Dicas de atalhos de teclado (Ctrl+C, Ctrl+V)
- Barra de fórmulas (simulada)

**Arquivo zip para upload:** `docs/aulainterativa/exemplos/excel-basico.zip`

---

## 2. Interface do Word

### Abordagem: HTML Embutido

Barra de ferramentas do Word com abas clicáveis (Página Inicial, Inserir, Layout, Revisão, Exibição).

```
aulas-interativas/
  word-interface/
    index.html
    style.css
    script.js
```

**Funcionalidades:**
- Abas na parte superior (Página Inicial, Inserir, Layout, etc.)
- Cada aba revela seu grupo de botões
- Ao clicar num botão, mostra descrição do que ele faz
- Simulação de formatação de texto (negrito, itálico, sublinhado)
- Exemplos de parágrafos formatados

**Estrutura das abas:**

| Aba | Botões |
|---|---|
| Página Inicial | Negrito, Itálico, Sublinhado, Cor da Fonte, Tamanho, Listas |
| Inserir | Tabela, Imagem, Gráfico, Cabeçalho, Rodapé |
| Layout | Margens, Orientação, Colunas, Quebras |
| Revisão | Ortografia, Sinônimos, Comentários, Controlar Alterações |
| Exibição | Modo de Leitura, Layout de Impressão, Régua, Zoom |

---

## 3. Hotspots em Imagem

### Abordagem: React Components

Uma imagem com regiões clicáveis (hotspots). Útil para diagramas, mapas, fotos de equipamentos.

```tsx
// src/components/interactive/HotspotImage.tsx
interface Hotspot {
  id: string;
  x: number;      // % da largura
  y: number;      // % da altura
  width: number;  // % da largura
  height: number; // % da altura
  label: string;
  info: { title: string; description: string };
}

interface HotspotImageProps {
  imageUrl: string;
  hotspots: Hotspot[];
}
```

**Exemplo de uso:** Diagrama de uma célula vegetal em Biologia, onde cada organela é um hotspot.

---

## 4. Simulador de Dashboard

### Abordagem: React Components

Painel com gráficos, indicadores e KPIs onde cada card é clicável e expande com detalhes.

```tsx
<InteractiveDashboard
  metrics={[
    { label: 'Faturamento', value: 'R$ 1.2M', change: '+12%',
      info: 'Faturamento acumulado no mês atual' },
    { label: 'Alunos', value: '342', change: '+8%',
      info: 'Total de alunos matriculados' },
  ]}
/>
```

---

## 5. Mapa Interativo

### Abordagem: HTML Embutido

Mapa do Brasil (SVG) onde cada estado é clicável e mostra dados regionais.

```html
<svg viewBox="0 0 800 600">
  <!-- Cada estado é um <path> clicável -->
  <path id="SP" d="..." onclick="mostrarInfo('SP')"
        class="state" />
  <path id="RJ" d="..." onclick="mostrarInfo('RJ')"
        class="state" />
</svg>
```

---

## Como adicionar um novo exemplo

1. Crie a pasta em `aulas-interativas/<slug>/`
2. Coloque `index.html` + assets
3. Crie um zip: `zip -r <slug>.zip <slug>/`
4. Faça upload via API ou admin
