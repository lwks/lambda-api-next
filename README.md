# Lambda API Next

API REST construída com Express e empacotada com `serverless-http` para execução em AWS Lambda. A aplicação usa DynamoDB (AWS SDK v3) como camada de persistência e organiza a lógica em camadas de controllers, services, utilitários e middlewares reutilizáveis.

## Requisitos

- Node.js 20.x (compatível com 22.x)
- Cinco tabelas DynamoDB: `Empresas`, `Candidaturas`, `Usuarios`, `Vagas` e `Dominio`
- Variáveis de ambiente para cada tabela ou, alternativamente, uma variável `TABLE_NAME` para fallback global
- Configuração do Amazon Cognito para validação de JWT Bearer nas rotas protegidas

## Estrutura do projeto

```text
src/
├── app.js                  # Instância Express + middlewares globais
├── handler.js              # Adaptador Lambda (exporta handler.lambdaHandler)
├── local.js                # Runner local (node src/local.js)
├── auth/                   # Helpers de autenticação Cognito
│   └── cognitoVerifier.js
├── middleware/             # Middlewares reutilizáveis
│   └── auth.js
├── aws_services/           # Clientes e integrações AWS SDK v3
│   └── dynamoClient.js
├── controllers/            # Controllers com regras HTTP e validação
├── routes/                 # Definições de rotas Express
├── services/               # Regras de negócio / DynamoDB access
├── tests/                  # Testes automatizados
└── utils/                  # Utilitários (erros, responses, paginação, validação)
```

## Formato dos itens persistidos

Os itens gravados no DynamoDB seguem o padrão abaixo:

- **Chaves:** `pk` = `ENTITY#<id>`, `sk` = `ENTITY`.
- **Campos gerados automaticamente:** `id` (UUID), `entityType`, `createdAt`, `updatedAt`.
- **Payload mesclado:** o payload enviado pelo cliente é mesclado com esses campos antes da persistência.

Para detalhes técnicos, consulte `src/services/entityServiceFactory.js`.

## Variáveis de ambiente

### DynamoDB

```bash
export CANDIDATE_TABLE_NAME=Candidaturas
export COMPANY_TABLE_NAME=Empresas
export DOMAIN_TABLE_NAME=Dominio
export USER_TABLE_NAME=Usuarios
export JOB_TABLE_NAME=Vagas
# opcional: use TABLE_NAME para fornecer um fallback comum
export AWS_REGION=us-east-1
```

### Amazon Cognito JWT

> A API usa **`access_token`** como padrão para autorização. O backend **não implementa login/logout/callback**: ele apenas valida o JWT Bearer enviado nas rotas protegidas.

```bash
export COGNITO_REGION=us-east-1
export COGNITO_USER_POOL_ID=us-east-1_abc123
export COGNITO_APP_CLIENT_ID=4h57exampleclientid
# opcional: exige que o access_token contenha este scope
export COGNITO_REQUIRED_SCOPE=jobs:write
# opcional: lista CSV de grupos aceitos
export COGNITO_ALLOWED_GROUPS=admins,recruiters
```

### O que é validado no JWT

A validação é feita com `aws-jwt-verify` e cobre, no mínimo:

- assinatura do token
- expiração (`exp`)
- emissor (`iss`)
- uso do token (`token_use=access`)
- `client_id` do app client configurado
- `scope` obrigatório, quando `COGNITO_REQUIRED_SCOPE` estiver configurado
- `cognito:groups`, quando `COGNITO_ALLOWED_GROUPS` estiver configurado

Quando o token é validado com sucesso, a API anexa no request/contexto autenticado:

- `sub`
- `scope` (array)
- `groups`
- `username`
- `clientId`
- `tokenUse`
- `claims` (payload completo validado)

## Executar localmente

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Exporte as variáveis de ambiente necessárias de DynamoDB e Cognito.
3. Rode o servidor local:

   ```bash
   npm run dev
   # ou
   npm start
   ```

4. A API ficará acessível em `http://localhost:3000`.

> **Nota:** O runner local usa Express puro. Em produção a Lambda chamará `handler.lambdaHandler` definido em `src/handler.js`.

## Autenticação e autorização

### Header esperado

```http
Authorization: Bearer <access_token>
```

### Rotas públicas

As rotas abaixo permanecem públicas para preservar a arquitetura atual e evitar breaking changes desnecessários nos fluxos já usados pelo front:

- `GET /health`
- `GET /docs`
- `GET /docs.json`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/candidates`
- `GET /api/zips/:zip`

#### Decisão sobre `/api/zips`

`/api/zips` permanece pública porque a consulta de CEP é usada no preenchimento de formulários do front e não expõe dados sensíveis. Isso evita exigir autenticação para um lookup utilitário de endereço.

### Rotas protegidas

Todas as demais rotas sob `/api` exigem JWT Bearer válido do Cognito. Exemplos:

- `GET /api/candidates`
- `GET /api/candidates/by-job-guids`
- `GET /api/candidates/:id`
- `PUT /api/candidates/:id`
- `DELETE /api/candidates/:id`
- `POST /api/jobs`
- `PUT /api/jobs/:id`
- `DELETE /api/jobs/:id`
- `GET /api/domains`
- `GET /api/domains/:tipo/:code`
- `POST /api/domains`
- `PUT /api/domains`
- `PUT /api/domains/:tipo/:code`
- `POST /api/companies`
- `GET /api/companies`
- `GET /api/users`
- demais operações administrativas sob `/api/companies` e `/api/users`

### Respostas padronizadas de autenticação

#### `401 Unauthorized`

Usado para token ausente, Bearer malformado, token inválido ou expirado.

```json
{
  "message": "Unauthorized",
  "details": {
    "reason": "invalid_token"
  }
}
```

Outros `reason` possíveis:

- `missing_authorization_header`
- `malformed_bearer_token`
- `invalid_token`

#### `403 Forbidden`

Usado quando o token é válido, mas não tem `scope` ou grupo suficiente.

```json
{
  "message": "Forbidden",
  "details": {
    "reason": "insufficient_scope",
    "requiredScope": "jobs:write",
    "scope": ["openid", "jobs:read"]
  }
}
```

Exemplo para grupos:

```json
{
  "message": "Forbidden",
  "details": {
    "reason": "insufficient_group",
    "allowedGroups": ["admins", "recruiters"],
    "groups": ["candidates"]
  }
}
```

## Endpoints

Todos os endpoints são versionados sob `/api`.

### Documentação

- `GET /docs` — Swagger UI.
- `GET /docs.json` — JSON OpenAPI.

### Saúde

- `GET /health` — Verifica disponibilidade da aplicação.

### Candidatos (`/api/candidates`)

| Método | Rota | Autenticação | Descrição | Body (JSON) |
| --- | --- | --- | --- | --- |
| `POST` | `/` | Pública | Cria um candidato | `{ "fullName": string, "email": string, "guid_id": string, "guid_vaga": string, ... }` |
| `GET` | `/by-job-guids?guid_vaga=...` | JWT | Lista candidaturas por `guid_vaga` (query) | — |
| `GET` | `/` | JWT | Lista candidatos (suporta `limit` e `lastKey`) | — |
| `GET` | `/:id` | JWT | Obtém um candidato | — |
| `PUT` | `/:id` | JWT | Atualiza candidato | Campos parciais |
| `DELETE` | `/:id` | JWT | Remove candidato | — |

#### Filtro por vagas (`GET /api/candidates/by-job-guids`)

Este endpoint recebe `guid_vaga` na query string e retorna as candidaturas vinculadas.

**Exemplos de query:**

```http
GET /api/candidates/by-job-guids?guid_vaga=JOB-GUID-001
GET /api/candidates/by-job-guids?guid_vaga=JOB-GUID-001&guid_vaga=JOB-GUID-002
GET /api/candidates/by-job-guids?guid_vaga=JOB-GUID-001,JOB-GUID-002
```

### Empresas (`/api/companies`)

| Método | Rota | Autenticação | Descrição | Body (JSON) |
| --- | --- | --- | --- | --- |
| `POST` | `/` | JWT | Cria empresa | `{ "name": string, "cd_cnpj": string, ... }` |
| `GET` | `/` | JWT | Lista empresas (`limit`, `lastKey`) | — |
| `GET` | `/:id` | JWT | Obtém empresa | — |
| `PUT` | `/:id` | JWT | Atualiza empresa | Campos parciais |
| `DELETE` | `/:id` | JWT | Remove empresa | — |

### Usuários (`/api/users`)

| Método | Rota | Autenticação | Descrição | Body (JSON) |
| --- | --- | --- | --- | --- |
| `POST` | `/` | JWT | Cria usuário | `{ "username": string, "role": string, "cd_cpf": string, ... }` |
| `GET` | `/` | JWT | Lista usuários (`limit`, `lastKey`) | — |
| `GET` | `/:id` | JWT | Obtém usuário | — |
| `PUT` | `/:id` | JWT | Atualiza usuário | Campos parciais |
| `DELETE` | `/:id` | JWT | Remove usuário | — |

### Dominios (`/api/domains`)

| MÃ©todo | Rota | AutenticaÃ§Ã£o | DescriÃ§Ã£o | Body (JSON) |
| --- | --- | --- | --- | --- |
| `GET` | `/` | JWT | Lista dominios (`limit`, `lastKey`, `tipo`, `active`) | â€” |
| `GET` | `/:tipo/:code` | JWT | Obtem item de dominio pela chave logica | â€” |
| `POST` | `/` | JWT | Cria item de dominio | `{ "tipo": string, "code": string, "label": string, "active": boolean, "sortOrder": number, ... }` |
| `PUT` | `/` | JWT | Atualiza item pela chave tecnica literal | `{ "tipo": string, "codigo": string, ... }` |
| `PUT` | `/:tipo/:code` | JWT | Atualiza item pela chave logica | Campos parciais |

### Vagas (`/api/jobs`)

| Método | Rota | Autenticação | Descrição | Body (JSON) |
| --- | --- | --- | --- | --- |
| `POST` | `/` | JWT | Cria vaga | `{ "title": string, "companyId": string, "guid_id": string, ... }` |
| `GET` | `/` | Pública | Lista vagas (`limit`, `lastKey`) | — |
| `GET` | `/:id` | Pública | Obtém vaga | — |
| `PUT` | `/:id` | JWT | Atualiza vaga | Campos parciais |
| `DELETE` | `/:id` | JWT | Remove vaga | — |

### CEPs (`/api/zips`)

| Método | Rota | Autenticação | Descrição | Body (JSON) |
| --- | --- | --- | --- | --- |
| `GET` | `/:zip` | Pública | Consulta cidade e estado a partir de um CEP brasileiro (8 dígitos, com ou sem hífen) | — |

**Resposta de sucesso:**

```json
{
  "data": "Rua X - Bairro Y - São Paulo/SP"
}
```

**Erros comuns:**

- `400` — CEP inválido (formato diferente de 8 dígitos).
- `404` — CEP não encontrado no serviço externo.
- `502` — Falha ao consultar o serviço de CEP.

## Paginação

- Query `limit`: número máximo de itens (restrito de 1 a 100, padrão 20).
- Query `lastKey`: token Base64URL retornado em listagens anteriores.

## Respostas e erros

- Sucesso padrão: `{ "data": ... }`
- Erros de validação retornam `400` com `{ "message": string, "details": { ... } }`.
- Falhas de autenticação retornam `401`.
- Falhas de autorização retornam `403`.
- Entidades inexistentes retornam `404`.

## Testes

A suíte automatizada usa Jest + Supertest e cobre o fluxo de autenticação Cognito, incluindo:

- sucesso com token válido
- `401` sem header `Authorization`
- `401` com Bearer malformado
- `401` com token inválido
- `401` com token expirado (mockado)
- `403` por `scope` ou grupo insuficiente
- bypass correto das rotas públicas

Comandos úteis:

```bash
npm test
npm run test:coverage
```

## Deploy na AWS Lambda

1. Garanta que o pacote contenha `src/handler.js` e que as variáveis `CANDIDATE_TABLE_NAME`, `COMPANY_TABLE_NAME`, `DOMAIN_TABLE_NAME`, `USER_TABLE_NAME` e `JOB_TABLE_NAME` estejam configuradas na função Lambda (ou utilize `TABLE_NAME` como fallback global, se apropriado).
2. Configure a runtime para **Node.js 20.x** (compatível com 22.x).
3. Configure também as variáveis `COGNITO_REGION`, `COGNITO_USER_POOL_ID` e `COGNITO_APP_CLIENT_ID` na Lambda.
4. Use qualquer ferramenta de empacotamento (SAM, Serverless Framework, AWS CDK) apontando para `handler.lambdaHandler`.
5. Conceda permissões de leitura/escrita na tabela DynamoDB configurada.
