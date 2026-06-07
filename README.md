# Elegis - Sistema de Presença e Certificação

O **Elegis** é uma plataforma completa e responsiva desenvolvida para a **Câmara Municipal de Ourilândia do Norte**. O sistema visa gerenciar de ponta a ponta a presença, certificação e participação de servidores e cidadãos em cursos, palestras e eventos organizados pela instituição.

## Principais Funcionalidades

- **Controle de Usuários e Permissões**: Múltiplos níveis de acesso (`ADMIN`, `COORDENADOR`, `PROFESSOR`, `ALUNO`), onde apenas administradores e professores/coordenadores podem criar e gerenciar eventos.
- **Leitura de QR Code e Presença**: Geração dinâmica de QR Codes que duram poucos minutos para garantir a veracidade da presença presencial em sala de aula (registro com timestamp exato).
- **Emissão Automática de Certificados**: Com design oficial parametrizado da Câmara, o sistema emite e valida certificados gerando um Hash único e código QR de verificação de autenticidade (anti-fraude).
- **Importação CSV Inteligente**: Cadastro em lote de pessoas diretamente pelo painel administrativo, tratando automaticamente conflitos e atualizando cargos e departamentos.
- **Recuperação Automática de Senha**: Envio de links únicos de curta duração por e-mail, utilizando `Nodemailer` apontado para servidor SMTP próprio da câmara.

## Tecnologias Utilizadas

- **Frontend**: React + Vite + Tailwind CSS + Lucide React (Ícones).
- **Backend**: Node.js + Express + TypeScript.
- **Banco de Dados**: PostgreSQL (Relacional) e Redis (Para gerência de filas e Rate Limit).
- **Infraestrutura**: Docker & Docker Compose para isolamento total das aplicações.

---

## 🚀 Como Colocar em Produção (Deploy)

A aplicação foi inteiramente "conteinerizada" usando Docker, o que significa que o ambiente de Produção é idêntico ao ambiente de Desenvolvimento, apenas com senhas diferentes.

### 1. Pré-Requisitos do Servidor Linux (VPS/Nuvem)
Você precisará ter instalado na sua máquina:
- **Docker**
- **Docker Compose**
- **Nginx Proxy Manager** (ou outro Proxy Reverso) para gerenciar o domínio e os certificados SSL (Let's Encrypt).

### 2. Preparando os Arquivos
Clone ou copie todo este repositório para uma pasta no seu servidor.
Copie o arquivo de exemplo de ambiente para criar o seu arquivo de produção:

```bash
cp .env.docker .env.prod
```

Abra o arquivo `.env.prod` e configure as senhas fortes de banco de dados e as suas credenciais de e-mail (SMTP):

```ini
# --- BANCO DE DADOS ---
POSTGRES_USER=elegiscmon
POSTGRES_PASSWORD=SUA_SENHA_FORTE
POSTGRES_DB=elegiscmon

# --- JWT (SEGURANÇA) ---
JWT_SECRET=UM_TEXTO_MUITO_GRANDE_E_ALEATORIO

# --- E-MAIL ---
MAIL_HOST=mail.ourilandiadonorte.pa.leg.br
MAIL_PORT=587
MAIL_USERNAME=notificacoes@ourilandiadonorte.pa.leg.br
MAIL_PASSWORD=senha_do_email
MAIL_FROM_ADDRESS=notificacoes@ourilandiadonorte.pa.leg.br
MAIL_FROM_NAME="Elegis - Câmara Municipal de Ourilândia do Norte"
```

### 3. Subindo os Contêineres
Na mesma pasta onde está o `docker-compose.yml`, rode o comando apontando para o seu novo arquivo `.env.prod`:

```bash
docker compose --env-file .env.prod up --build -d
```

O Docker baixará todas as dependências isoladas (Alpine Linux), compilará o código e deixará três containers rodando:
- **elegiscmon-db**: PostgreSQL interno
- **elegiscmon-backend**: API rodando na porta `3001` internamente.
- **elegiscmon-frontend**: Aplicação Web rodando na porta `8080` (sendo mapeado internamente).

### 4. Configurando o Domínio (Nginx Proxy Manager)
No seu Nginx Proxy Manager (NPM):
1. Crie um **Proxy Host**.
2. **Domain Names**: O domínio de acesso (ex: `elegiscmon.orb.local` ou `cursos.ourilandiadonorte.pa.leg.br`).
3. **Forward Hostname / IP**: O IP do seu próprio servidor (ou `elegiscmon-frontend` se estiverem na mesma rede docker).
4. **Forward Port**: `8080`.
5. Aba **SSL**: Solicite um novo certificado ("Request a new SSL Certificate") marcando `Force SSL`.
6. Salve. O NPM cuidará de rotear os pacotes HTTP e as conexões Websocket para o front-end corretamente.

### 5. Primeiro Acesso
Como o Nginx Proxy Manager cuidará de redirecionar o tráfego HTTP/HTTPS:
1. Acesse o seu domínio pelo navegador.
2. Faça login com a matrícula principal da Câmara **`CMON10010`**.
3. A senha inicial será **`cmon10010`** (a matrícula em letras minúsculas).
4. O sistema irá te reconhecer como `ADMIN` imediatamente e pedirá para você alterar a sua senha como segurança.

A partir daqui, use o Menu Configurações para subir a Logo oficial, editar usuários ou importar a base atual de servidores da Casa.
