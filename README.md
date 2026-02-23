# Lambda API Next

API REST construída com Express e empacotada com `serverless-http` para execução em AWS Lambda. A aplicação usa DynamoDB (AWS SDK v3) como camada de persistência e organiza a lógica em camadas de controllers, services, utils e integrações AWS.

## Requisitos

- Node.js 20.x (compatível com 22.x)
- Quatro tabelas DynamoDB com chave composta (`pk`, `sk`): `Empresas`, `Candidaturas`, `Usuarios` e `Vagas`
- Variáveis de ambiente para cada tabela ou, alternativamente, uma variável `TABLE_NAME` para fallback global

## Estrutura do projeto

```
src/
├── app.js                  # Instância Express + middlewares
├── handler.js              # Adaptador Lambda (exporta handler.lambdaHandler)
├── local.js                # Runner local (node src/local.js)
├── aws_services/           # Clientes e integrações AWS SDK v3
│   └── dynamoClient.js
├── controllers/            # Controllers com regras HTTP e validação
│   ├── candidateController.js
│   ├── companyController.js
│   ├── jobController.js
│   └── userController.js
├── routes/                 # Definições de rotas Express
│   ├── candidateRoutes.js
│   ├── companyRoutes.js
│   ├── index.js
│   ├── jobRoutes.js
│   └── userRoutes.js
├── services/               # Regras de negócio / DynamoDB access
│   └── entityServiceFactory.js
└── utils/                  # Utilitários (erros, responses, paginação, validação)
    ├── errors.js
    ├── pagination.js
    ├── response.js
    └── validators.js
```

## Formato dos itens persistidos

Os itens gravados no DynamoDB seguem o padrão abaixo:

- **Chaves:** `pk` = `ENTITY#<id>`, `sk` = `ENTITY`.
- **Campos gerados automaticamente:** `id` (UUID), `entityType`, `createdAt`, `updatedAt`.
- **Payload mesclado:** o payload enviado pelo cliente é mesclado com esses campos antes da persistência.

Para detalhes técnicos, consulte `src/services/entityServiceFactory.js`.

## Executar localmente

1. Instale as dependências (`npm install`).
2. Exporte as variáveis de ambiente necessárias:

   ```bash
   export CANDIDATE_TABLE_NAME=Candidaturas
   export COMPANY_TABLE_NAME=Empresas
   export USER_TABLE_NAME=Usuarios
   export JOB_TABLE_NAME=Vagas
   # opcional: use TABLE_NAME para fornecer um fallback comum
   export AWS_REGION=us-east-1            # opcional, padrão é us-east-1
   ```

3. Rode o servidor local:

   ```bash
   npm run dev
   # ou
   npm start
   ```

4. A API ficará acessível em `http://localhost:3000`.

> **Nota:** O runner local usa Express puro. Em produção a Lambda chamará `handler.lambdaHandler` definido em `src/handler.js`.

## Endpoints

Todos os endpoints são versionados sob `/api`. Cada recurso expõe operações CRUD completas.

### Documentação

- `GET /docs` — Swagger UI.
- `GET /docs.json` — JSON OpenAPI.

> **Nota:** Os endpoints de documentação são servidos no mesmo host/porta da API.

### Saúde

- `GET /health` — Verifica disponibilidade da aplicação.

### Candidatos (`/api/candidates`)

| Método | Rota | Descrição | Body (JSON) |
| --- | --- | --- | --- |
| `POST` | `/` | Cria um candidato | `{ "fullName": string, "email": string, "guid_id": string, "guid_vaga": string, ... }`
| `POST` | `/by-job-guids` | Lista candidaturas por lista de `guid_vaga` | `{ "guid_vaga": string[] }`
| `GET` | `/` | Lista candidatos (suporta `limit` e `lastKey`) | — |
| `GET` | `/:id` | Obtém um candidato | — |
| `PUT` | `/:id` | Atualiza candidato | Campos parciais |
| `DELETE` | `/:id` | Remove candidato | — |

#### Filtro por vagas (`POST /api/candidates/by-job-guids`)

Este endpoint recebe uma lista de GUIDs de vagas e retorna as candidaturas vinculadas a qualquer `guid_vaga` informado.

**Body esperado:**

```json
{
  "guid_vaga": ["JOB-GUID-001", "JOB-GUID-002"]
}
```

**Validações:**

- `guid_vaga` deve ser um array não vazio.
- Cada item deve ser uma string não vazia.

### Empresas (`/api/companies`)

| Método | Rota | Descrição | Body (JSON) |
| --- | --- | --- | --- |
| `POST` | `/` | Cria empresa | `{ "name": string, "cd_cnpj": string, ... }`
| `GET` | `/` | Lista empresas (`limit`, `lastKey`) | — |
| `GET` | `/:id` | Obtém empresa | — |
| `PUT` | `/:id` | Atualiza empresa | Campos parciais |
| `DELETE` | `/:id` | Remove empresa | — |

### Usuários (`/api/users`)

| Método | Rota | Descrição | Body (JSON) |
| --- | --- | --- | --- |
| `POST` | `/` | Cria usuário | `{ "username": string, "role": string, "cd_cpf": string, ... }`
| `GET` | `/` | Lista usuários (`limit`, `lastKey`) | — |
| `GET` | `/:id` | Obtém usuário | — |
| `PUT` | `/:id` | Atualiza usuário | Campos parciais |
| `DELETE` | `/:id` | Remove usuário | — |

### Vagas (`/api/jobs`)

| Método | Rota | Descrição | Body (JSON) |
| --- | --- | --- | --- |
| `POST` | `/` | Cria vaga | `{ "title": string, "companyId": string, "guid_id": string, ... }`
| `GET` | `/` | Lista vagas (`limit`, `lastKey`) | — |
| `GET` | `/:id` | Obtém vaga | — |
| `PUT` | `/:id` | Atualiza vaga | Campos parciais |
| `DELETE` | `/:id` | Remove vaga | — |

### CEPs (`/api/zips`)

| Método | Rota | Descrição | Body (JSON) |
| --- | --- | --- | --- |
| `GET` | `/:zip` | Consulta cidade e estado a partir de um CEP brasileiro (8 dígitos, com ou sem hífen) | — |

**Resposta de sucesso:**

```json
{
  "data": "Rua X - Bairro Y - São Paulo/SP"
}
```

O retorno é uma string de localização composta.

**Erros comuns:**

- `400` — CEP inválido (formato diferente de 8 dígitos).
- `404` — CEP não encontrado no serviço externo.
- `502` — Falha ao consultar o serviço de CEP.

### Paginação

- Query `limit`: número máximo de itens (restrito de 1 a 100, padrão 20).
- Query `lastKey`: token Base64URL retornado em listagens anteriores.

### Respostas e erros

- Sucesso padrão: `{ "data": ... }`
- Erros de validação retornam `400` com `{ "message": string, "details": { missing: [...] } }`.
- Entidades inexistentes retornam `404`.

## Deploy na AWS Lambda

1. Garanta que o pacote contenha `src/handler.js` e que as variáveis `CANDIDATE_TABLE_NAME`, `COMPANY_TABLE_NAME`, `USER_TABLE_NAME` e `JOB_TABLE_NAME` estejam configuradas na função Lambda (ou utilize `TABLE_NAME` como fallback global, se apropriado).
2. Configure a runtime para **Node.js 20.x** (compatível com 22.x).
3. Use qualquer ferramenta de empacotamento (SAM, Serverless Framework, AWS CDK) apontando para `handler.lambdaHandler`.
4. Conceda permissões de leitura/escrita na tabela DynamoDB configurada.

## Testes

Este projeto não inclui testes automatizados. Recomenda-se adicionar suites com Jest ou outra ferramenta conforme necessário.
