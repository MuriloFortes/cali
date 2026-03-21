# Prompt para Cursor — Chat Cliente ↔ Admin (NovaMart)

## Contexto do Projeto

NovaMart é um e-commerce monorepo com:

- **Backend:** Node.js + Express (ES Modules) na porta 3002, SQLite via `better-sqlite3`, autenticação JWT (Bearer token, 24h), bcryptjs, Multer para uploads
- **Frontend:** React 18 + Vite (porta 5173), Tailwind CSS, Lucide-react para ícones, estado global com `useReducer` + Context API — tudo em um único arquivo `src/App.jsx` (~2900 linhas)
- **Auth middleware:** `backend/middleware/auth.js` exporta `authenticateToken` (extrai user do JWT) e `requireAdmin` (verifica `role === 'admin'`)
- **Banco:** SQLite com tabelas `users` (id TEXT, name, email, role 'admin'|'customer', active), `products`, `orders`, `order_items`
- **Credenciais padrão:** admin@loja.com / admin123 | cliente@loja.com / 123456
- **Idioma da UI:** Português (pt-BR)

---

## O que preciso construir

Um sistema de **chat em tempo real** entre clientes e o administrador, integrado ao projeto existente. O cliente abre uma conversa e o admin responde. O admin pode ver e gerenciar múltiplas conversas.

---

## Requisitos Funcionais

### 1. Backend — Banco de Dados

Criar duas novas tabelas no arquivo `backend/database.js` (onde já existem as tabelas `users`, `products`, `orders`, `order_items`):

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES users(id),
  subject TEXT DEFAULT '',
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 2. Backend — API REST

Criar novo arquivo de rotas `backend/routes/chat.js` e registrar no `backend/server.js` (`app.use('/api/chat', chatRoutes)`).

**Endpoints:**

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/api/chat/conversations` | Customer | Criar nova conversa (body: `{ subject }`) |
| `GET` | `/api/chat/conversations` | Auth | Listar conversas — customer vê as suas, admin vê todas |
| `GET` | `/api/chat/conversations/:id` | Auth | Detalhe da conversa + todas as mensagens |
| `POST` | `/api/chat/conversations/:id/messages` | Auth | Enviar mensagem (body: `{ content }`) |
| `PATCH` | `/api/chat/conversations/:id/close` | Admin | Fechar conversa |
| `PATCH` | `/api/chat/conversations/:id/read` | Auth | Marcar mensagens como lidas |
| `GET` | `/api/chat/unread-count` | Auth | Retornar contagem de mensagens não lidas |

**Regras importantes:**
- Somente o customer dono ou um admin podem acessar uma conversa
- Ao enviar mensagem, atualizar `updated_at` da conversa
- Ao listar conversas, incluir: última mensagem, nome do customer, contagem de não lidas
- Ordenar conversas por `updated_at DESC` (mais recente primeiro)
- IDs de conversa no formato `CONV-XXX` (incremental)

### 3. Backend — Polling em Tempo Real

Como o projeto **não usa WebSocket**, implementar via **short polling**:
- O frontend faz `GET /api/chat/conversations/:id` a cada 3 segundos quando o chat está aberto
- O endpoint `/api/chat/unread-count` é chamado a cada 10 segundos para atualizar o badge de notificação

### 4. Frontend — Lado do Cliente (Customer)

Adicionar no `src/App.jsx`:

**Novo estado no reducer:**
```js
chatConversations: [],
chatMessages: [],
chatOpen: false,           // chat widget aberto/fechado
activeChatId: null,        // conversa ativa
chatUnreadCount: 0,
chatLoading: false,
newChatSubject: '',
newChatMessage: '',
```

**Novas actions no reducer:**
```
SET_CHAT_CONVERSATIONS, SET_CHAT_MESSAGES, SET_CHAT_OPEN,
SET_ACTIVE_CHAT, SET_CHAT_UNREAD, SET_CHAT_LOADING,
ADD_CHAT_MESSAGE, SET_NEW_CHAT_SUBJECT, SET_NEW_CHAT_MESSAGE
```

**Componente: Widget de Chat flutuante (canto inferior direito)**

- **Botão flutuante:** Ícone `MessageCircle` do lucide-react, com badge vermelho mostrando `chatUnreadCount` (se > 0)
- **Ao clicar:** Abre painel de chat (350px largura × 500px altura) com animação slide-up
- **Tela 1 — Lista de conversas:**
  - Header: "Atendimento" + botão "Nova Conversa"
  - Lista de conversas com: assunto, última mensagem (truncada), horário, badge de não lidas
  - Conversas fechadas aparecem com visual de opacidade reduzida
- **Tela 2 — Conversa ativa:**
  - Header: assunto + botão voltar
  - Área de mensagens com scroll automático para baixo
  - Mensagens do cliente alinhadas à direita (bg azul), do admin à esquerda (bg cinza)
  - Nome do remetente + horário em cada mensagem
  - Input de texto + botão enviar (Enter também envia)
  - Mensagem de aviso se a conversa está fechada ("Esta conversa foi encerrada")
- **Tela "Nova Conversa":**
  - Campo de assunto (obrigatório)
  - Campo de primeira mensagem (obrigatório)
  - Botão "Iniciar Conversa"

**Polling:**
- Quando a conversa está aberta, fazer polling a cada 3s para novas mensagens
- Em qualquer página, fazer polling a cada 10s para unread count (só se logado como customer)
- Usar `useEffect` com `setInterval`, limpar no cleanup

### 5. Frontend — Lado do Admin

Adicionar nova aba no painel admin (onde já existem "Visão Geral", "Produtos", "Usuários"):

**Nova aba: "Atendimento" (ícone `MessageSquare`)**

- **Lista de conversas:**
  - Filtros: Todas | Abertas | Fechadas
  - Busca por nome do cliente ou assunto
  - Cards mostrando: nome do cliente, assunto, última mensagem, horário, status (badge verde "Aberta" / cinza "Fechada"), contagem de não lidas (badge vermelho)
  - Ordenadas por mais recente

- **Ao clicar numa conversa:**
  - Abre painel de chat à direita (layout side-by-side: lista à esquerda, chat à direita)
  - Mesma UI de mensagens do widget do cliente
  - Botão "Encerrar Conversa" no header (só para conversas abertas)
  - Marcar mensagens como lidas automaticamente ao abrir

- **Badge no menu admin:**
  - Mostrar contagem total de mensagens não lidas do admin na aba "Atendimento"

**Polling admin:**
- A cada 5s atualizar lista de conversas quando na aba de atendimento
- A cada 3s atualizar mensagens da conversa ativa

---

## Padrões a Seguir (IMPORTANTE)

1. **Estilo de código:** Seguir exatamente o padrão existente no `App.jsx` — componentes como funções dentro do componente principal `App`, usando `state` e `dispatch` do reducer pai
2. **API wrapper:** Usar a função `api()` existente no App.jsx para todas as chamadas HTTP (ela já injeta o token JWT e trata erros)
3. **Toasts:** Usar `dispatch({ type: 'ADD_TOAST', payload: { type, message } })` para notificações
4. **Ícones:** Importar do `lucide-react` (já usado no projeto)
5. **Estilização:** Tailwind CSS inline (classes utilitárias), seguindo o design system existente (cores, bordas arredondadas, sombras, gradientes)
6. **IDs:** Gerar com `crypto.randomUUID()` no backend ou formato sequencial `CONV-XXX`
7. **Datas:** Formatar em pt-BR como no resto do projeto
8. **Responsividade:** O widget do chat deve funcionar bem em mobile (tela cheia em telas pequenas)
9. **Não instalar dependências novas** — usar apenas o que já existe no projeto
10. **Backend ES Modules:** Usar `import/export` (não `require/module.exports`)

---

## Estrutura de Arquivos a Criar/Modificar

### Criar:
- `backend/routes/chat.js` — rotas da API de chat

### Modificar:
- `backend/database.js` — adicionar tabelas `conversations` e `messages`
- `backend/server.js` — registrar `chatRoutes`
- `src/App.jsx` — adicionar estado, actions, componentes do chat (widget do cliente + aba admin)

---

## Ordem de Implementação Sugerida

1. Tabelas no banco (`database.js`)
2. Rotas da API (`chat.js` + registro no `server.js`)
3. Estado e actions no reducer (`App.jsx`)
4. Widget de chat do cliente (`App.jsx`)
5. Aba de atendimento do admin (`App.jsx`)
6. Polling e unread count
7. Testar fluxo completo: cliente envia mensagem → admin recebe → admin responde → cliente vê resposta
