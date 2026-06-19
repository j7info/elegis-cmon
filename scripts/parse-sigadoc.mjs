import fs from 'fs';
import path from 'path';

const markdownPath = 'docs/aulainterativa/aula sigadoc 001/aula.md';
const content = fs.readFileSync(markdownPath, 'utf8');

const lines = content.split('\n');
const screens = [];
let currentScreen = null;
let currentHotspot = null;
let state = 'IDLE'; // IDLE, EXPLANATION, HOTSPOTS

for (let i = 0; i < lines.length; i++) {
  let line = lines[i].trim();
  if (!line) continue;

  if (line.startsWith('## Tela')) {
    const titleMatch = line.match(/## Tela \d+ — (.*)/);
    const title = titleMatch ? titleMatch[1] : line.replace('## ', '');
    currentScreen = {
      image: `/interactive/sigadoc/tela-${String(screens.length + 1).padStart(2, '0')}.png`,
      title,
      explanation: '',
      hotspots: []
    };
    screens.push(currentScreen);
    state = 'IDLE';
  } else if (line.startsWith('**Explicação geral da tela:**')) {
    state = 'EXPLANATION';
  } else if (line.startsWith('**Pontos clicáveis sugeridos:**')) {
    state = 'HOTSPOTS';
  } else if (line === '---') {
    state = 'IDLE';
  } else if (state === 'EXPLANATION') {
    if (currentScreen.explanation) currentScreen.explanation += '\n';
    currentScreen.explanation += line;
  } else if (state === 'HOTSPOTS') {
    if (line.startsWith('**') && line.endsWith('**')) {
      currentHotspot = {
        title: line.replace(/\*\*/g, ''),
        description: ''
      };
      currentScreen.hotspots.push(currentHotspot);
    } else if (currentHotspot) {
      if (currentHotspot.description) currentHotspot.description += '\n';
      currentHotspot.description += line;
    }
  }
}

const definitionContent = `export const sigadocData = ${JSON.stringify(screens, null, 2)};
`;

const dirPath = 'src/components/interactive/SigadocSimulador';
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

fs.writeFileSync(path.join(dirPath, 'definition.ts'), definitionContent);
console.log('Successfully parsed to definition.ts');
