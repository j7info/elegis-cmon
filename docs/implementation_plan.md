# Plano de Implementação: Regras de Professores, Alunos e Pré-Cadastro

## Visão Geral
Adaptar a lógica de usuários para que qualquer pessoa cadastrada possa ser aluno, e definir explicitamente professores principais e auxiliares em cursos e aulas. Além disso, implementar o fluxo de pré-cadastro (sem matrícula) e inscrição em cursos antes do registro de presença.

## Alterações no Banco de Dados (Migração SQL)
1. **Tabela `app_users`**:
   - Alterar a coluna `matricula` para permitir valores nulos (`DROP NOT NULL`), já que alunos no pré-cadastro ainda não terão matrícula. A restrição `UNIQUE` ignorará os nulos.
   - Adicionar uma flag `is_pre_registered BOOLEAN DEFAULT FALSE`.
2. **Tabela `courses`**:
   - Manter `owner_id` (que será renomeado conceitualmente para `main_teacher_id` nas rotas).
3. **Nova Tabela `course_teachers`**:
   - `course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE`
   - `teacher_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE`
   - (Para permitir mais de um professor por curso).
4. **Tabela `classes`**:
   - Adicionar `auxiliary_teacher_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL`.
5. **Tabela `registrations`**:
   - Garantir que ela use o `student_id` mapeado para o `app_users.id` no futuro, ou continue usando `identifier` (CPF/Email) como chave única de aluno.

## Backend (Rotas e Lógica)
1. **Cursos e Aulas**:
   - Atualizar `POST /api/courses` e `PUT` para receber `main_teacher_id` e um array `additional_teacher_ids`.
   - Atualizar `POST /api/classes` e `PUT` para receber `auxiliary_teacher_id`.
   - Criar rota `GET /api/courses/:id/enrollment-link` que gera o link de inscrição público.
2. **Pré-Cadastro e Usuários**:
   - Criar `POST /api/public/pre-register`: Recebe Nome, CPF, E-mail. Cria o registro na `app_users` com `is_pre_registered = true` e `matricula = NULL`. Retorna os dados do usuário.
   - Atualizar o painel de usuários (`/api/users`) para listar esses usuários e permitir que o administrador insira a matrícula depois.
3. **Presenças e Inscrições**:
   - Rota `POST /api/courses/:id/enroll`: Inscreve o usuário no curso (se ele existir na `app_users`).
   - Rota `POST /api/attendances/scan`: 
     - Verifica se o aluno (buscado pelo CPF/Email) existe na base.
     - Se NÃO EXISTE: Retorna erro `USER_NOT_FOUND` (frontend redireciona para pré-cadastro).
     - Se EXISTE, mas NÃO INSCRITO NO CURSO: Retorna `NOT_ENROLLED` (frontend pede para se inscrever).
     - Se EXISTE e INSCRITO: Registra a presença.

## Frontend (Telas e Fluxo)
1. **Página de Cursos / Aulas**:
   - Adicionar os campos de "Professor Principal", "Professores Adicionais" no formulário de curso.
   - Adicionar "Professor Auxiliar" no formulário de aulas.
   - No detalhe do curso, gerar e mostrar o link de inscrição.
2. **Fluxo do Aluno (Ler QR Code / Link de Inscrição)**:
   - Ao acessar a página pública de registro (lendo o QR Code ou clicando no link do curso), o sistema pedirá o CPF.
   - **Caso 1: CPF não existe no sistema.**
     - Redireciona para `/pre-register`.
     - O aluno preenche os dados. Após salvar, o sistema o marca no navegador como identificado e o redireciona de volta para a inscrição/scan.
   - **Caso 2: CPF existe, mas não inscrito.**
     - Tela exibe: "Você precisa se inscrever no curso X". Botão "Inscrever-me".
     - Ao clicar, inscreve e já registra a presença daquela aula.
   - **Caso 3: Tudo certo.**
     - Apenas exibe sucesso na presença.
3. **Painel de Usuários (Admin)**:
   - Destacar os usuários que estão "Pré-cadastrados" (sem matrícula).
   - Permitir edição rápida para o admin adicionar a matrícula definitiva gerada no outro sistema.

> [!WARNING]
> **Atenção:** 
> - A matrícula continuará sendo o login para os usuários administrativos/professores entrarem no sistema. Usuários pré-cadastrados (apenas alunos) não conseguirão acessar a área restrita até ganharem a matrícula.
> - O identificador principal dos alunos na hora de escanear será o CPF, pois é o dado mais seguro para garantir a unicidade no pré-cadastro.

## Dúvidas em Aberto (Para sua aprovação)
- Está de acordo em usar o **CPF** como o identificador base para o aluno na hora de ler o QR Code ou se inscrever (já que ele ainda não terá matrícula)?
- Podemos usar a mesma tabela de usuários (`app_users`) e apenas deixá-los sem acesso ao painel admin enquanto não tiverem matrícula?

Aguardando sua confirmação ou ajustes para iniciar a codificação!
