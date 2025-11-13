# Lambda API Next

API REST construída com Express e empacotada com `serverless-http` para execução em AWS Lambda. A aplicação usa DynamoDB (AWS SDK v3) como camada de persistência e organiza a lógica em camadas de controllers, services, utils e integrações AWS.

## Requisitos

- Node.js 20.x (compatível com 22.x)
- Uma tabela DynamoDB com chave composta (`pk`, `sk`)
- Variável de ambiente `TABLE_NAME` apontando para a tabela DynamoDB

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

## Executar localmente

1. Instale as dependências (`npm install`).
2. Exporte as variáveis de ambiente necessárias:

   ```bash
   export TABLE_NAME=<nome-da-sua-tabela>
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

### Saúde

- `GET /health` — Verifica disponibilidade da aplicação.

### Candidatos (`/api/candidates`)

| Método | Rota | Descrição | Body (JSON) |
| --- | --- | --- | --- |
| `POST` | `/` | Cria um candidato | `{ "fullName": string, "email": string, "guid_id": string, ... }`
| `GET` | `/` | Lista candidatos (suporta `limit` e `lastKey`) | — |
| `GET` | `/:id` | Obtém um candidato | — |
| `PUT` | `/:id` | Atualiza candidato | Campos parciais |
| `DELETE` | `/:id` | Remove candidato | — |

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

### Paginação

- Query `limit`: número máximo de itens (padrão 20).
- Query `lastKey`: token Base64URL retornado em listagens anteriores.

### Respostas e erros

- Sucesso padrão: `{ "data": ... }`
- Erros de validação retornam `400` com `{ "message": string, "details": { missing: [...] } }`.
- Entidades inexistentes retornam `404`.

## Deploy na AWS Lambda

1. Garanta que o pacote contenha `src/handler.js` e que `TABLE_NAME` esteja configurada na função Lambda.
2. Configure a runtime para **Node.js 20.x** (compatível com 22.x).
3. Use qualquer ferramenta de empacotamento (SAM, Serverless Framework, AWS CDK) apontando para `handler.lambdaHandler`.
4. Conceda permissões de leitura/escrita na tabela DynamoDB configurada.

## Testes

Este projeto não inclui testes automatizados. Recomenda-se adicionar suites com Jest ou outra ferramenta conforme necessário.
