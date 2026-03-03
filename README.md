# Lambda API Next (Backend)

API REST em Node.js + Express, preparada para AWS Lambda com `serverless-http`, persistindo dados no DynamoDB.

## Stack

- Node.js 20.x (compatível com 22.x)
- Express 4
- AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)
- `serverless-http`
- `swagger-jsdoc` + `swagger-ui-express`
- CommonJS

## Estrutura principal

```txt
src/
+-- app.js
+-- handler.js
+-- local.js
+-- aws_services/dynamoClient.js
+-- config/tableNames.js
+-- controllers/
+-- routes/
+-- services/
+-- utils/
+-- swagger.js
```

## Execução local

1. Instale dependências:

```bash
npm install
```

2. Rode localmente:

```bash
npm run dev
# ou
npm start
```

3. Porta padrão: `3000` (`PORT` opcional)

## Deploy AWS Lambda

- Handler exportado: `lambdaHandler` em `src/handler.js`
- Runtime recomendado: Node.js 20.x
- Entry point típico: `src/handler.lambdaHandler`

## Variáveis de ambiente

- `AWS_REGION` ou `AWS_DEFAULT_REGION` (default: `us-east-1`)
- `PORT` (local)
- Tabelas DynamoDB:
  - `CANDIDATE_TABLE_NAME` (default `Candidaturas`)
  - `COMPANY_TABLE_NAME` (default `Empresas`)
  - `USER_TABLE_NAME` (default `Usuarios`)
  - `JOB_TABLE_NAME` (default `Vagas`)

## CORS

A API responde globalmente com:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With`
- `OPTIONS` retorna `204`

## Padrão de respostas

### Sucesso

```json
{ "data": ... }
```

### Criação

- Status `201`
- Body: `{ "data": ... }`

### Delete

- Status `204`
- Sem body

### Erro

```json
{ "message": "..." }
```

ou

```json
{ "message": "...", "details": { ... } }
```

## Endpoints fora de `/api`

### `GET /health`

Resposta `200`:

```json
{ "status": "ok" }
```

### `GET /docs`

Swagger UI.

### `GET /docs.json`

OpenAPI JSON gerado em código.

## Endpoints da API (`/api`)

## Candidatos

### `POST /api/candidates`

Campos mínimos obrigatórios:

- `guid_id`
- `guid_vaga`

Possíveis retornos:

- `201` `{ data: candidate }`
- `400` `{ message, details }` (campos obrigatórios ausentes)
- `500` `{ message }`

### `GET /api/candidates`

Query params:

- `limit` (default `20`, min `1`, max `100`)
- `lastKey` (token Base64URL)

Possíveis retornos:

- `200`

```json
{
  "data": {
    "items": [],
    "lastKey": "eyJwayI6Ii4uLiJ9"
  }
}
```

- `500` `{ message }`

### `GET /api/candidates/by-job-guids`

Filtro por `guid_vaga` (aceita repetido ou CSV):

- `?guid_vaga=A&guid_vaga=B`
- `?guid_vaga=A,B`

Comportamento:

- normaliza valores
- remove duplicados
- ignora vazios
- ordena por `createdAt` ascendente (mais antigo -> mais novo)

Possíveis retornos:

- `200`

```json
{
  "data": {
    "items": [],
    "total": 0
  }
}
```

- `400` `{ message, details }` quando `guid_vaga` não contém ao menos um valor válido
- `500` `{ message }`

### `GET /api/candidates/:id`

Possíveis retornos:

- `200` `{ data: candidate }`
- `404` `{ message: "candidate with id <id> not found" }`
- `500` `{ message }`

### `PUT /api/candidates/:id`

Possíveis retornos:

- `200` `{ data: candidateAtualizado }`
- `404` `{ message: "candidate with id <id> not found" }`
- `500` `{ message }`

Observação: se nenhum campo válido for enviado no body, a API retorna o registro atual.

### `DELETE /api/candidates/:id`

Possíveis retornos:

- `204` sem body
- `404` `{ message: "candidate with id <id> not found" }`
- `500` `{ message }`

## Empresas

### `POST /api/companies`

Campo mínimo obrigatório:

- `cd_cnpj`

Possíveis retornos:

- `201` `{ data: company }`
- `400` `{ message, details }`
- `500` `{ message }`

### `GET /api/companies`

Query params:

- `limit` (default `20`, min `1`, max `100`)
- `lastKey`

Possíveis retornos:

- `200` `{ data: { items, lastKey } }`
- `500` `{ message }`

### `GET /api/companies/:id`

Possíveis retornos:

- `200` `{ data: company }`
- `404` `{ message: "company with id <id> not found" }`
- `500` `{ message }`

### `PUT /api/companies/:id`

Possíveis retornos:

- `200` `{ data: companyAtualizada }`
- `404` `{ message: "company with id <id> not found" }`
- `500` `{ message }`

### `DELETE /api/companies/:id`

Possíveis retornos:

- `204` sem body
- `404` `{ message: "company with id <id> not found" }`
- `500` `{ message }`

## Usuários

### `POST /api/users`

Campo mínimo obrigatório:

- `cd_cpf`

Possíveis retornos:

- `201` `{ data: user }`
- `400` `{ message, details }`
- `500` `{ message }`

### `GET /api/users`

Query params:

- `limit` (default `20`, min `1`, max `100`)
- `lastKey`

Possíveis retornos:

- `200` `{ data: { items, lastKey } }`
- `500` `{ message }`

### `GET /api/users/:id`

Possíveis retornos:

- `200` `{ data: user }`
- `404` `{ message: "user with id <id> not found" }`
- `500` `{ message }`

### `PUT /api/users/:id`

Possíveis retornos:

- `200` `{ data: userAtualizado }`
- `404` `{ message: "user with id <id> not found" }`
- `500` `{ message }`

### `DELETE /api/users/:id`

Possíveis retornos:

- `204` sem body
- `404` `{ message: "user with id <id> not found" }`
- `500` `{ message }`

## Vagas

### `POST /api/jobs`

Campo mínimo obrigatório:

- `guid_id`

Possíveis retornos:

- `201` `{ data: job }`
- `400` `{ message, details }`
- `500` `{ message }`

### `GET /api/jobs`

Query params:

- `limit` (default `20`, min `1`, max `100`)
- `lastKey`

Possíveis retornos:

- `200` `{ data: { items, lastKey } }`
- `500` `{ message }`

### `GET /api/jobs/:id`

Possíveis retornos:

- `200` `{ data: job }`
- `404` `{ message: "job with id <id> not found" }`
- `500` `{ message }`

### `PUT /api/jobs/:id`

Possíveis retornos:

- `200` `{ data: jobAtualizada }`
- `404` `{ message: "job with id <id> not found" }`
- `500` `{ message }`

### `DELETE /api/jobs/:id`

Possíveis retornos:

- `204` sem body
- `404` `{ message: "job with id <id> not found" }`
- `500` `{ message }`

## CEP

### `GET /api/zips/:zip`

Aceita:

- `12345678`
- `12345-678`

Resposta de sucesso:

- `200`

```json
{
  "data": "Rua X - Bairro Y - Cidade/UF"
}
```

Possíveis erros:

- `400` CEP inválido:

```json
{
  "message": "CEP inválido. Utilize 8 dígitos, com ou sem hífen.",
  "details": { "zip": "valor-invalido" }
}
```

- `404` CEP não encontrado
- `502` erro no serviço externo (ViaCEP)

## Modelo de persistência no DynamoDB

Cada item criado recebe automaticamente:

- `id` (UUID se não informado)
- `entityType`
- `pk`
- `sk`
- `createdAt`
- `updatedAt`

Chaves:

- `pk = <ENTITYTYPE>#<id>` (ex.: `CANDIDATE#123`)
- `sk = ENTITY`

Entidades atuais:

- candidate
- company
- user
- job

## Paginação

Listagens de CRUD retornam cursor em `lastKey` (Base64URL):

- Envie `lastKey` recebido anteriormente para continuar paginação.
- Se `lastKey` vier inválido, ele é ignorado silenciosamente.

## Observações importantes

- Não há autenticação/autorização implementada.
- Não há rotas `PATCH`.
- Não há testes automatizados no repositório.
- Listagens e filtros principais usam `Scan` no DynamoDB (com `FilterExpression` por `entityType`).
