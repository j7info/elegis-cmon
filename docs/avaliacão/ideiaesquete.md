# Sistema de Avaliação Interativa em Sala de Aula

## Visão Geral
Implementar um sistema de avaliação dinâmico dentro das aulas, inspirado em ferramentas como **Mentimeter** e **Kahoot**. O objetivo é substituir avaliações tradicionais chatas por uma experiência interativa com perguntas de múltipla escolha, onde os alunos participam em tempo real pelos seus próprios dispositivos.

---

## Funcionalidades

### 1. Criação da Avaliação (Professor)
- Dentro da página de uma aula, haverá um botão **"Inserir Avaliação"**
- Ao clicar, abre um **modal** com recursos para criar o questionário
- **Todas as perguntas são de múltipla escolha**
- Cada pergunta deve ter **4 alternativas**
- O professor define qual alternativa é a **correta** no momento da criação
- É possível criar **quantas perguntas quiser**

### 2. Disponibilização da Avaliação
- Após criado, o questionário fica acessível por um botão chamado **"Avaliação"** dentro da aula
- O professor clica nesse botão **após encerrar o slide** da aula

### 3. Entrada dos Alunos
- O sistema exibe um **QR Code** para os alunos acessarem o ambiente virtual de avaliação
- Cada aluno acessa pelo seu próprio dispositivo (celular/tablet)
- **Assim que o aluno entra, seu nome aparece em uma lista** visível ao professor
- Quando todos estiverem logados, o professor **avança para o início do questionário**

### 4. Execução da Avaliação (Tela do Professor)
- O questionário é exibido no formato de **slides** — uma pergunta por tela
- Fluxo de cada pergunta:
  1. **Pergunta com alternativas** é exibida — alunos veem e marcam a resposta nos seus dispositivos
  2. O sistema **aguarda um tempo** (definido pelo professor na criação)
  3. O sistema **mostra a resposta correta** e **quantos acertaram**
  4. O professor **avança manualmente** para a próxima pergunta
  5. O ciclo se repete até o fim do questionário

### 5. Experiência do Aluno (Dispositivo Móvel)
- O aluno vê as alternativas na tela do seu aparelho
- Marca a alternativa que julga correta
- Após o tempo limite, vê se acertou ou errou

---

## Inspiração
- **Mentimeter** — apresentações interativas com votação em tempo real
- **Kahoot** — quizzes gamificados com competitividade e feedback instantâneo

---

## Status da Implementação (Jun/2026)

### ✅ Concluído

#### Banco de Dados
- Migração `005_evaluations.sql` — tabelas: `evaluations`, `questions`, `alternatives`, `evaluation_participants`, `student_answers`

#### Backend (server/src/routes/evaluations.ts)
| Rota | Descrição |
|------|-----------|
| `GET /api/classes/:id/evaluations` | Listar avaliações de uma aula |
| `POST /api/classes/:id/evaluations` | Criar avaliação com perguntas e alternativas |
| `GET /api/evaluations/:id` | Detalhes da avaliação |
| `PUT /api/evaluations/:id` | Atualizar título/tempo |
| `DELETE /api/evaluations/:id` | Excluir avaliação |
| `POST /api/evaluations/:id/start` | Iniciar sala de espera (QR Code) |
| `POST /api/evaluations/:id/begin` | Iniciar questionário (primeira pergunta) |
| `POST /api/evaluations/:id/next-phase` | Avançar fase (pergunta → resultado → próxima) |
| `POST /api/evaluations/:id/end` | Finalizar avaliação |
| `GET /api/evaluations/:id/session` | Estado completo da sessão (professor) |
| `POST /api/evaluations/:id/join` | Aluno entra na avaliação (público) |
| `POST /api/evaluations/:id/answer` | Aluno responde pergunta (público) |
| `GET /api/evaluations/:id/state` | Estado atual para o aluno |

#### Frontend
- **ClassDetail.tsx**: Seção "Avaliações" com lista + botão "Inserir Avaliação" + modal de criação
- **EvaluationSession.tsx**: Página do professor — sala de espera com QR Code, lista de participantes, perguntas em slide, temporizador, resultado com estatísticas e lista de quem acertou
- **StudentQuiz.tsx**: Página do aluno no celular — formulário de entrada, tela de pergunta com alternativas, feedback de acerto/erro

### 🔄 Pendente / Melhorias Futuras
- [ ] WebSockets/SSE para atualização em tempo real (atualmente usa polling a cada 2s)
- [ ] Ranking final com pontuação acumulada
- [ ] Sons e animações (estilo Kahoot)
- [ ] Bloqueio de resposta após estouro do tempo no frontend
- [ ] Histórico de respostas por aluno ao final
- [ ] Exportar relatório da avaliação
