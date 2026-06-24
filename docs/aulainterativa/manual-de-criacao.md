# Manual de Criação de Aulas Interativas

O Módulo de Aula Interativa permite que você crie duas modalidades distintas de interatividade: **Componentes React** (integrados ao código) ou **HTML Embutido** (simulações completas desenvolvidas de forma independente).

As aulas originais (presenciais, online) permanecem **totalmente intactas**. A Aula Interativa é apenas um novo recurso que pode ser associado às aulas já existentes no sistema.

---

## 1. Abordagem: Componentes React

Utilize esta modalidade quando você precisar de interações com os dados do próprio sistema ou interações de formulários dinâmicos.

### Passo 1: Gerar a estrutura base
Execute o script CLI na raiz do projeto para criar o componente base:
```bash
node scripts/criar-aula-interativa.mjs
```
Siga os passos do prompt e escolha a abordagem "1. React Components".
*Ele irá gerar os arquivos do componente em `src/components/interactive/<SuaAula>` e a página em `src/pages/InteractiveLesson_<SuaAula>.tsx`.*

### Passo 2: Editar a Definição
Abra o arquivo `definition.ts` que foi gerado na pasta do seu componente e ajuste as colunas e linhas. O sistema usa um JSON para renderizar uma tabela interativa base.

### Passo 3: Mapear o Componente
Para que o componente dinâmico seja exibido pelo banco de dados:
1. Abra `src/pages/InteractiveLessonPage.tsx`
2. No bloco `if (config.type === 'react')`, faça o link do ID (ex: `excel-basico`) apontando para o seu componente `<InteractiveLesson_SuaAula />`.

### Passo 4: Salvar no Banco
Você pode vincular essa tela à Aula usando o endpoint da API:
```bash
curl -X POST http://localhost:8080/api/classes/ID_DA_AULA/interactive \
  -H "Authorization: Bearer <SEU_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "type": "react", "definition": { "id": "sua-aula" } }'
```

---

## 2. Abordagem: HTML Embutido (Recomendado para Simulações)

Utilize esta modalidade para simular sistemas externos (como Excel, Word), mini-jogos, ou dashboards em HTML puro sem mexer no código-fonte em React.

### Padrão Recomendado: Tutorial Guiado (Screenshots + Legendas)

Para criar aulas baseadas na exibição passo a passo de telas de sistemas (ex: webmail, SEI, planilhas), o padrão recomendado é um layout interativo com a seguinte estrutura:
- **Desktop:** Layout em linha (`flex-direction: row`). A imagem se autoajusta no lado esquerdo da tela e um painel lateral escuro para o texto fica fixo à direita.
- **Mobile (Responsividade Obrigatória):** Em telas menores (ex: `max-width: 900px`), o layout deve alterar para coluna (`flex-direction: column`). A imagem deve ocupar cerca de `50vh` no topo, e o painel de texto deve ficar nos `50vh` inferiores, garantindo que o texto nunca sobreponha a imagem e permitindo leitura confortável sem cortes.
- **Conteúdo:** Use um arquivo `data.js` como fonte dos passos, contendo ao menos `text` e `image`. O fluxo mais estável para screenshots é exibir apenas a tela e o texto explicativo, sem indicadores sobrepostos.
- **Identificação de slides:** Em aulas baseadas em prints, cada imagem deve ser tratada como um slide. Se vários textos explicam o mesmo print, eles são passos de leitura dentro do mesmo slide, não slides diferentes. O script deve agrupar passos consecutivos com o mesmo `image`, contar o progresso por imagem e registrar início/fim apenas quando o print muda.
- **Tempo mínimo por slide:** Leia `min_seconds` e `unlocked_slides` da URL enviada pelo sistema pai. Slides com índice menor que `unlocked_slides` devem iniciar liberados, permitindo que o aluno volte e avance livremente pelo histórico já registrado. O bloqueio local só pode valer para o primeiro slide ainda não registrado, para refletir a regra do sistema. Em `review=1`, a navegação deve ser livre e não deve registrar novo progresso.
- **Eventos para o sistema pai:** Ao abrir um print, envie `INTERACTIVE_SLIDE_START`. Ao sair de um print pela primeira vez, envie `INTERACTIVE_SLIDE_END`. Durante a leitura, envie `INTERACTIVE_VIEW_PROGRESS` com `viewed_slides`, `total_slides`, `current_slide`, `current_step`, `total_steps` e `remaining_seconds`. No final, continue enviando `LESSON_PROGRESS` com `score: 100`.
- **Indicação visual:** Evite setas, círculos, spotlight ou coordenadas sobre a imagem até existir uma tecnologia de marcação mais confiável. Em prints de sistemas reais, pequenos deslocamentos prejudicam a aula; prefira explicar no texto qual região o aluno deve observar.

### Passo 1: Desenvolver a Simulação
Crie uma pasta local e desenvolva seu HTML, CSS e JavaScript seguindo essas regras essenciais:

- O arquivo principal **DEVE** se chamar `index.html`.
- Você pode adicionar pastas de imagens ou scripts (ex: `style.css`, `script.js`).
- Use caminhos relativos para assets: `./assets/tela-01.png`, `./script.js`, `./style.css`.
- Evite caminhos absolutos como `/assets/tela-01.png`, porque dentro do iframe eles apontam para a raiz do sistema, não para a pasta da aula.
- Se usar JavaScript moderno dentro de `<script>`, escreva template literals normalmente com crase. **Não escape** crases nem `${...}`.

Exemplo correto:

```javascript
const ativo = true;
card.className = `card ${ativo ? 'card-ativo' : 'card-inativo'}`;
```

Exemplo que quebra a aula com `SyntaxError: Invalid or unexpected token`:

```javascript
card.className = \`card \${ativo ? 'card-ativo' : 'card-inativo'}\`;
```

**Exemplo básico de arquivos (Tutorial Guiado):**
```text
sua_simulacao/
├── index.html (contém o #image-container na esquerda e .side-panel na direita)
├── style.css  (responsividade flexbox @media(max-width:900px))
├── script.js  (lógica de passar os passos, carregar imagens e emitir o score:100)
├── data.js    (const lessonData = [{ text: "...", image: "tela.png" }])
└── assets/    (todas as imagens)
```

### Passo 2: Validar antes de empacotar
Antes de subir a aula, abra o `index.html` localmente no navegador e confira o console.

A aula só deve ser zipada quando:

- Não houver erro vermelho no console.
- As imagens carregarem localmente.
- O botão/conclusão chamar `parent.postMessage(...)`.
- Os caminhos das imagens forem relativos, por exemplo `./assets/tela-01.png`.

Também é recomendado servir a pasta localmente para simular melhor o ambiente do iframe:

```bash
cd /caminho/da/sua-aula
python3 -m http.server 8765
```

Depois abra:

```text
http://localhost:8765/index.html
```

### Passo 3: Empacotar (ZIP)
Comprima os arquivos da sua simulação num único arquivo `.zip`.
Certifique-se de que o `index.html` está na raiz do `.zip` (e não dentro de uma subpasta).

Estrutura correta:

```text
sua_simulacao.zip
├── index.html
├── data.js
└── assets/
    ├── tela-01.png
    └── tela-02.png
```

Estrutura errada:

```text
sua_simulacao.zip
└── minha-pasta/
    ├── index.html
    └── assets/
        └── tela-01.png
```

Se o ZIP estiver com subpasta, o sistema não encontrará `/index.html` no local esperado.

### Passo 4: Fazer o Upload
Use a API do sistema para fazer o upload associando à aula. O sistema extrairá o `.zip` automaticamente e configurará o iFrame:

```bash
curl -X POST http://localhost:8080/api/classes/ID_DA_AULA/interactive \
  -H "Authorization: Bearer <SEU_TOKEN>" \
  -F "type=html" \
  -F "file=@/caminho/para/sua_simulacao.zip"
```

### Passo 5: Conferir depois do upload
Depois do upload, abra a aula como aluno e veja o console do navegador.

Erros comuns:

| Mensagem | Causa provável | Como corrigir |
|---|---|---|
| `Invalid or unexpected token` | JavaScript inválido, geralmente crase escapada (`\``) ou `${...}` escapado | Corrija o HTML/JS e reenvie o ZIP |
| Imagem não carrega | Caminho absoluto ou arquivo fora da pasta `assets` | Use `./assets/nome-da-imagem.png` e confira se o arquivo está no ZIP |
| `index.html` não encontrado | ZIP contém uma pasta extra antes do `index.html` | Gere o ZIP a partir dos arquivos internos, não da pasta pai |
| Aula abre mas não conclui | Falta `postMessage` com `score: 100` | Adicione a função de conclusão conforme a seção abaixo |

O aviso `cdn.tailwindcss.com should not be used in production` não impede a aula de funcionar. Ele é apenas uma recomendação do Tailwind. Para aulas simples, pode ser ignorado durante a validação funcional.

### Passo 6: Acesso e Identificação do Aluno
O aluno, ao acessar a página do curso e clicar no título da aula, será direcionado para uma tela de **Check-in da Aula Interativa**. Ele preencherá CPF e Nome para iniciar a sessão. A partir daí, a sua simulação será carregada em tela cheia (iFrame).

Se o aluno estiver logado e estiver matriculado no curso, o sistema pode usar os dados da conta dele para facilitar o check-in.

---

## 3. Registro de Presença Automático (Obrigatório)

Para que o aluno receba **100% de presença** e a aula conste como "Concluída", a sua simulação deve informar ao sistema pai (o ElegisCmon) quando o aluno terminar a tarefa com sucesso. Isso é feito usando a API nativa do navegador `postMessage`.

**Dentro do seu arquivo index.html (ou script.js):**
```javascript
function finalizarSimulacao() {
  // Apenas enviar score: 100 fará o sistema registrar a conclusão e dar a presença total ao aluno
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'LESSON_PROGRESS',
      data: { score: 100 } // Obrigatório ser 100 para conclusão!
    }, '*');
  }
}
```

O sistema pai (React) irá escutar essa mensagem automaticamente. Assim que ele receber o `score: 100`, ele envia o comando de conclusão para o backend de forma invisível, fecha o iFrame e exibe uma tela verde de celebração com o certificado de "100% Concluído" para o aluno.
