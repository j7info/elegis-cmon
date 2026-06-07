# Resumo da Implementação (Walkthrough)
## Sistema de Certificação e Presença (CMON)

A base do projeto foi completamente adaptada para funcionar de forma independente em containers Docker, substituindo o Firebase por um ecossistema próprio de alta performance usando Node.js, PostgreSQL e Redis. A nova estrutura garante total independência, privacidade dos dados e performance de sobra para atender seus 200+ usuários simultâneos.

### 1. Migração de Arquitetura e Banco de Dados
- **Firebase Removido:** O uso do Firestore foi totalmente removido do projeto. Todos os dados (Aulas, Presenças, Alunos, Configurações) agora são persistidos e gerenciados localmente no **PostgreSQL** (`elegiscmon-db`).
- **Esquema Relacional Otimizado (SQL):** As coleções do Firebase deram lugar a tabelas rígidas com regras de consistência (como `ON DELETE CASCADE`), garantindo integridade dos dados caso um curso ou aula seja excluído. Foram implementados diversos Índices (`INDEX`) para garantir que buscas complexas sejam feitas em milissegundos.
- **Sessões e Rate Limit (Redis):** O **Redis** (`elegiscmon-redis`) foi adicionado à stack para garantir alta vazão. Ele armazena o estado do Rate Limiting e a lista de controle de sessões dos usuários logados.

### 2. Autenticação e Segurança (Matrícula)
- O antigo login via pop-up do Google do Firebase foi substituído.
- Agora, a aplicação conta com um sistema próprio que valida credenciais utilizando criptografia Bcrypt.
- O formato obrigatório de login passou a ser a **matrícula** no padrão `LLLLNNNNN` (ex: `CMON10010`).
- > [!TIP]
  > No primeiro acesso, a senha padrão de cada servidor é a sua própria matrícula em **letras minúsculas**. Dentro de "Configurações", ele pode efetuar a troca da senha.

### 3. Backend Escalável e Proxy Reverso
- O backend foi construído em Express + TypeScript, servindo as rotas REST para todas as telas antigas da aplicação React.
- O Express está configurado para permitir uploads massivos em base64 (até 256MB).
- > [!IMPORTANT]
  > O backend possui a diretiva `trust proxy` ativada nativamente. Dessa forma, ele aceita de forma nativa e sem necessidade de alteração de código os cabeçalhos repassados pelo seu Nginx Proxy Manager (NPM), extraindo perfeitamente o IP real de quem está efetuando a requisição para fins de bloqueio no limitador de taxa e auditoria.
- 2. **Controle de Sessão**: Implementamos checagem de atividade no painel e rotinas de logoff automático com tokens rotativos e verificações anti-clonagem.

## Fase 3 - Refinamentos Administrativos, Perfis de Acesso e E-mails (Status: Concluído)
1. **Perfis de Acesso (`system_role`)**:
   - Criação de papéis de usuários (ADMIN, COORDENADOR, PROFESSOR, ALUNO).
   - Omitimos a "Criação de Curso/Aulas" e o menu de "Configurações" da interface do ALUNO.
2. **Edição Completa de Usuários**:
   - Pop-up de edição implementado no painel administrativo para modificar Departamento, Cargo, E-mail e Nível de Acesso (Papel).
3. **Disparador de E-mails**:
   - Integração com `nodemailer` para recuperar senhas conectando ao servidor local `notificacoes@ourilandiadonorte.pa.leg.br` (Porta 587).
   - Link de redefinição acionado pela tela de login ou pelo menu administrativo, que direciona para a nova rota de "Resetar Senha" (segura e expirável).
4. **Matrícula Permanente**:
   - `CMON10010` definido de maneira persistente via banco de dados como "Administrador Geral".
   
---

### Como testar as novidades?
- Acesse a plataforma como `CMON10010` (que já nascerá como `ADMIN`).
- Na tela de **Configurações**, verifique a lista de usuários, edite um dos nomes clicando no botão azul (lápis) e modifique suas permissões (ex: coloque um usuário de teste como PROFESSOR).
- Saia do sistema e faça login com a conta da pessoa que você acabou de definir como `PROFESSOR`. Perceba que agora ele verá o botão de "Criar Curso", mas não verá o botão de Configurações Administrativas.
- Para simular a visualização de `ALUNO`, edite o sistema_role para "ALUNO". Ao logar com essa conta, toda a interface de "Criar curso" sumirá, tornando-se uma tela super limpa voltada ao registro do próprio aluno.
- Teste clicar em "Esqueci a Senha" na página de login informando sua matrícula, para ver o envio ocorrendo para o seu e-mail cadastrado (jefersouza@...).

### 4. Upload de Funcionários Inteligente (CSV)
- Para facilitar a gerência da listagem base de funcionários (docs/pessoas.csv), ao invés de deixá-la estática num script oculto, criamos a função de **importação via navegador**.
- O Painel do Administrador (Configurações) agora possui um botão **Importar CSV**. Basta anexar o arquivo (com os cabeçalhos Matrícula e Nome na ordem correta) que o backend se encarrega de ler, filtrar duplicatas de matrícula, e gerar os credenciais de forma assíncrona.

### 5. Execução
Todo o projeto funciona de forma limpa via Docker Compose:
- **Frontend Nginx Alpine**: Porta 8080 (Mapeado no host)
- **Backend API Node.js**: Porta 3001 (Mapeado no host)
- **PostgreSQL**: Porta 5433 (Mapeado no host, para não conflitar com portas em uso)
- **Redis**: Porta 6379
