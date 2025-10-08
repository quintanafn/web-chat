# WhatsApp Web Connect

Uma aplicação que permite conectar múltiplos WhatsApps através de QR code e gerenciar todas as conversas em uma única interface.

## Funcionalidades

- Conexão de múltiplos WhatsApps via QR code
- Interface unificada para todas as conversas
- Envio e recebimento de mensagens em tempo real
- Gerenciamento de sessões WhatsApp
- Sincronização em tempo real entre dispositivos
- Armazenamento persistente de mensagens e contatos

## Tecnologias Utilizadas

### Backend
- Node.js
- Express
- Socket.IO
- whatsapp-web.js (biblioteca não-oficial para integração com WhatsApp)
- Supabase (banco de dados PostgreSQL)

### Frontend
- React.js
- Material-UI
- Socket.IO Client
- React Router

## Pré-requisitos

- Node.js (v14 ou superior)
- npm ou yarn
- Conta no Supabase (para banco de dados)

## Instalação e Execução Local

### Configuração do Supabase

1. Crie uma conta no [Supabase](https://supabase.com/) se ainda não tiver uma
2. Crie um novo projeto no Supabase
3. Copie a URL e a chave de API do seu projeto
4. Crie um arquivo `.env` na pasta `backend` com as seguintes variáveis:

```env
PORT=5001
NODE_ENV=development

# Supabase
SUPABASE_URL=sua_url_do_supabase
SUPABASE_KEY=sua_chave_do_supabase
```

### Backend

```bash
# Entrar na pasta do backend
cd backend

# Instalar dependências
npm install

# Iniciar o servidor em modo de desenvolvimento
npm run dev
```

O servidor backend será iniciado na porta 5001.

### Frontend

```bash
# Entrar na pasta do frontend
cd frontend

# Instalar dependências
npm install

# Iniciar o aplicativo React
npm start
```

O frontend será iniciado na porta 3001 e pode ser acessado em `http://localhost:3001`.

## Estrutura do Projeto

```
web-chat/
├── backend/           # Servidor Node.js
│   ├── config/        # Configurações (Supabase)
│   ├── models/        # Modelos para acesso ao banco de dados
│   ├── server.js      # Arquivo principal do servidor
│   └── package.json   # Dependências do backend
│
└── frontend/          # Aplicação React
    ├── public/        # Arquivos públicos
    └── src/           # Código fonte
        ├── components/    # Componentes React
        ├── contexts/      # Contextos React
        ├── pages/         # Páginas da aplicação
        └── services/      # Serviços (API, Socket)
```

## Estrutura do Banco de Dados

O aplicativo utiliza o Supabase (PostgreSQL) com as seguintes tabelas:

1. **users** - Armazena informações dos usuários
   - id (UUID): Identificador único do usuário
   - name (VARCHAR): Nome do usuário
   - email (VARCHAR): Email do usuário (opcional)
   - created_at (TIMESTAMP): Data de criação
   - updated_at (TIMESTAMP): Data de atualização

2. **whatsapp_sessions** - Armazena informações das sessões WhatsApp
   - id (VARCHAR): Identificador único da sessão
   - user_id (UUID): Referência ao usuário proprietário
   - name (VARCHAR): Nome da sessão
   - status (VARCHAR): Status da sessão (initializing, authenticated, connected, disconnected)
   - qr_code (TEXT): QR Code para autenticação
   - created_at (TIMESTAMP): Data de criação
   - updated_at (TIMESTAMP): Data de atualização

3. **contacts** - Armazena informações dos contatos
   - id (VARCHAR): Identificador único do contato
   - session_id (VARCHAR): Referência à sessão WhatsApp
   - name (VARCHAR): Nome do contato
   - number (VARCHAR): Número do telefone
   - profile_pic_url (TEXT): URL da foto de perfil
   - created_at (TIMESTAMP): Data de criação
   - updated_at (TIMESTAMP): Data de atualização

4. **messages** - Armazena as mensagens
   - id (VARCHAR): Identificador único da mensagem
   - session_id (VARCHAR): Referência à sessão WhatsApp
   - from_number (VARCHAR): Número do remetente
   - to_number (VARCHAR): Número do destinatário
   - body (TEXT): Conteúdo da mensagem
   - timestamp (BIGINT): Timestamp da mensagem
   - is_read (BOOLEAN): Indica se a mensagem foi lida
   - created_at (TIMESTAMP): Data de criação

## Como Usar

1. Inicie o backend e o frontend conforme as instruções acima
2. Acesse a aplicação em `http://localhost:3001`
3. Vá para a página de Configurações
4. Clique em "Adicionar" para criar uma nova sessão WhatsApp
5. Escaneie o QR code com seu WhatsApp
6. Após a conexão, vá para a página de Bate-papo ao Vivo para ver suas conversas

## Notas Importantes

- Esta aplicação utiliza a biblioteca não-oficial whatsapp-web.js para integração com o WhatsApp
- O armazenamento de dados é feito no Supabase (PostgreSQL)
- As sessões ativas do WhatsApp são mantidas em memória, mas os dados de mensagens e contatos são persistidos no banco de dados
- Para um ambiente de produção, recomenda-se configurar políticas de segurança adicionais no Supabase

## Limitações

- A aplicação depende da biblioteca não-oficial whatsapp-web.js, que pode ser afetada por mudanças no WhatsApp Web
- O WhatsApp oficial não permite múltiplas sessões simultâneas no mesmo dispositivo, por isso usamos uma abordagem alternativa
