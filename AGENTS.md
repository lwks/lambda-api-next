# AGENTS.md — Guia real do repositório `lambda-api-next`

Este documento descreve **o que existe hoje neste repositório**, para orientar agentes (Codex) e desenvolvedores que atuem no backend.

## 1) Escopo real do repositório

Este repositório é uma **API REST em Node.js com Express**, preparada para execução em **AWS Lambda** por meio de `serverless-http`.

Ele **não** contém o front-end em Next.js. O nome do repositório inclui `next`, mas a base atual é um backend JavaScript/CommonJS com rotas HTTP, controllers e integração com DynamoDB.

## 2) Stack atual

* **Runtime:** Node.js 20.x (compatível com 22.x)
* **Framework HTTP:** Express 4
* **Adapter para Lambda:** `serverless-http`
* **Persistência:** DynamoDB via AWS SDK v3 (`@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`)
* **Documentação:** `swagger-jsdoc` + `swagger-ui-express`
* **Módulo:** CommonJS
* **Geração de IDs:** `uuid`

## 3) Estrutura atual do projeto

```text
src/
├── app.js                  # App Express, middlewares, CORS, docs, health, rotas e tratamento global de erros
├── handler.js              # Exporta lambdaHandler para AWS Lambda
├── local.js                # Runner local em Node
├── aws_services/
│   └── dynamoClient.js     # DynamoDBClient + DynamoDBDocumentClient
├── config/
│   └── tableNames.js       # Resolução dos nomes de tabela por entidade
├── controllers/
│   ├── candidateController.js
│   ├── companyController.js
│   ├── jobController.js
│   ├── userController.js
│   └── zipController.js
├── routes/
│   ├── candidateRoutes.js
│   ├── companyRoutes.js
│   ├── index.js
│   ├── jobRoutes.js
│   ├── userRoutes.js
│   └── zipRoutes.js
├── services/
│   ├── entityServiceFactory.js  # CRUD genérico para entidades em DynamoDB
│   └── zipService.js            # Integração com ViaCEP
├── utils/
│   ├── errors.js
│   ├── logger.js
│   ├── pagination.js
│   ├── response.js
│   └── validators.js
└── swagger.js               # Especificação OpenAPI gerada em código
```

## 4) Comportamento HTTP real da aplicação

### Endpoints fora de `/api`

* `GET /health` → retorna `{ "status": "ok" }`
* `GET /docs` → Swagger UI
* `GET /docs.json` → OpenAPI em JSON

### Prefixo principal da API

Todas as rotas de negócio ficam sob **`/api`**.

## 5) Rotas reais expostas

### `/api/candidates`

* `POST /api/candidates`
* `GET /api/candidates`
* `GET /api/candidates/by-job-guids`
* `GET /api/candidates/:id`
* `PUT /api/candidates/:id`
* `DELETE /api/candidates/:id`

**Campo mínimo exigido no create:**

* `guid_id`
* `guid_vaga`

### `/api/companies`

* `POST /api/companies`
* `GET /api/companies`
* `GET /api/companies/:id`
* `PUT /api/companies/:id`
* `DELETE /api/companies/:id`

**Campo mínimo exigido no create:**

* `cd_cnpj`

### `/api/users`

* `POST /api/users`
* `GET /api/users`
* `GET /api/users/:id`
* `PUT /api/users/:id`
* `DELETE /api/users/:id`

**Campo mínimo exigido no create:**

* `cd_cpf`

### `/api/jobs`

* `POST /api/jobs`
* `GET /api/jobs`
* `GET /api/jobs/:id`
* `PUT /api/jobs/:id`
* `DELETE /api/jobs/:id`

**Campo mínimo exigido no create:**

* `guid_id`

### `/api/zips`

* `GET /api/zips/:zip`

Consulta CEP brasileiro e retorna a localização como **string** formatada, encapsulada em `data`.

Exemplo de resposta:

```json
{
  "data": "Rua X - Bairro Y - São Paulo/SP"
}
```

## 6) Regras de validação reais

As validações atuais são **mínimas** e baseadas apenas em presença de campos obrigatórios no create:

* Candidate: `guid_id`, `guid_vaga`
* Company: `cd_cnpj`
* User: `cd_cpf`
* Job: `guid_id`

Não há, hoje, validação de schema rica para payloads (por exemplo: formato de e-mail, enums, tamanho mínimo, etc.).

### Validação de CEP

`GET /api/zips/:zip` aceita apenas CEP com:

* `12345678`
* `12345-678`

Se o formato for inválido, retorna erro `400`.

## 7) Formato real de resposta

### Sucesso

Respostas de sucesso usam o helper padrão:

```json
{ "data": ... }
```

### Criação

Criações retornam:

* **status `201`**
* body no formato `{ "data": ... }`

### Delete

Deletes retornam:

* **status `204`**
* **sem body**

### Erros

Erros retornam:

```json
{ "message": "..." }
```

ou, quando houver detalhes:

```json
{ "message": "...", "details": { ... } }
```

## 8) CORS real

O middleware global de CORS hoje aplica:

* `Access-Control-Allow-Origin: *`
* `Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS`
* `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With`

Requests `OPTIONS` retornam **`204`** diretamente.

> Observação importante: **`PATCH` não está liberado** no CORS e também **não existe rota PATCH**.

## 9) Persistência real no DynamoDB

A persistência é centralizada em `entityServiceFactory.js`.

### Modelo de chave

Todos os registros seguem:

* `pk = <ENTITYTYPE>#<id>` em maiúsculas
* `sk = ENTITY`

Exemplos:

* candidate → `pk = CANDIDATE#<id>`
* company → `pk = COMPANY#<id>`
* user → `pk = USER#<id>`
* job → `pk = JOB#<id>`

### Campos gerados automaticamente

Ao criar um item, o backend acrescenta:

* `id` (UUID, se não vier no payload)
* `entityType`
* `pk`
* `sk`
* `createdAt`
* `updatedAt`

### Update

No update:

* `id` e `entityType` não são sobrescritos pela expressão de update
* `updatedAt` é sempre atualizado
* se nenhum campo válido for enviado, a API apenas retorna o registro atual

## 10) Paginação real

Listagens de CRUD usam:

* `limit` (default `20`, mínimo `1`, máximo `100`)
* `lastKey` (token em Base64URL)

O token recebido em `lastKey` é decodificado; se vier inválido, a API simplesmente ignora o token e segue sem cursor.

Resposta típica de listagem:

```json
{
  "data": {
    "items": [],
    "lastKey": "..."
  }
}
```

## 11) Como as consultas funcionam hoje

### CRUD padrão

As listagens usam **`ScanCommand` com `FilterExpression` por `entityType`**.

Isso significa que, no estado atual, a API **não usa Query otimizada por partição para listar**; ela faz varredura na tabela configurada e filtra pela entidade.

### Filtro de candidatos por vaga

`GET /api/candidates/by-job-guids`:

* aceita `guid_vaga` repetido na query
* aceita CSV (`guid_vaga=A,B`)
* normaliza, remove duplicados e ignora vazios
* executa varreduras (`Scan`) filtrando por `guid_vaga`
* percorre todas as páginas até esgotar resultados

Isso é funcional, mas tem custo e latência proporcionais ao volume da tabela.

## 12) Resolução de tabelas (comportamento exato atual)

As controllers instanciam os serviços com os nomes resolvidos em `src/config/tableNames.js`.

Hoje, os defaults efetivos são:

* candidates → `Candidaturas`
* companies → `Empresas`
* users → `Usuarios`
* jobs → `Vagas`

Ou seja, **na prática atual**, se as variáveis específicas não forem definidas, o código cai nesses nomes fixos.

> Observação importante: embora `entityServiceFactory` tenha suporte a `TABLE_NAME`, esse fallback global **não é o caminho efetivo nas controllers atuais**, porque elas já passam um nome de tabela explícito vindo de `tableNames.js`.

## 13) Execução local real

1. Instalar dependências:

```bash
npm install
```

2. Subir localmente:

```bash
npm run dev
# ou
npm start
```

3. Porta padrão:

* `PORT` default = `3000`

## 14) Deploy real na AWS Lambda

O handler exposto para Lambda é:

* `lambdaHandler` em `src/handler.js`

Ao empacotar e publicar:

* use runtime Node.js 20.x (ou 22.x compatível)
* aponte o handler para `src/handler.lambdaHandler` (ou equivalente no empacotamento, conforme a ferramenta)
* garanta permissão de leitura/escrita nas tabelas DynamoDB utilizadas
* configure `AWS_REGION` / `AWS_DEFAULT_REGION` se necessário

## 15) O que este repositório NÃO tem hoje

Para evitar suposições erradas, este repositório **não implementa**, no estado atual:

* autenticação/autorização
* integração com Cognito
* front-end em Next.js
* BFF do Next
* rotas `PATCH`
* testes automatizados
* validação avançada de contratos
* acesso por índices secundários (GSI/LSI) para listagens principais

## 16) Diretrizes para agentes trabalhando neste repositório

Se você estiver atuando neste código:

1. Trate este projeto como **backend Express serverless**, não como front.
2. Preserve o contrato real de respostas (`{ data: ... }`, `204` sem body, erros com `message`).
3. Não assuma validações ricas já existentes; hoje elas são mínimas.
4. Tenha atenção a custo/performance: listagens e filtros atuais fazem **Scan**.
5. Se for evoluir escalabilidade, a principal oportunidade está em:

   * modelagem de acesso por chave
   * uso de GSIs
   * evitar `Scan` para consultas frequentes
6. Se for alterar tabelas/config, valide o impacto da resolução atual de nomes em `tableNames.js`.
7. Não documente comportamento do front neste arquivo, a menos que o código do backend passe a depender explicitamente disso.

## 17) Resumo executivo

Este repositório é uma **API REST Node.js/Express para AWS Lambda**, com CRUD genérico em DynamoDB para:

* candidatos
* empresas
* usuários
* vagas
* consulta de CEP via ViaCEP

O desenho atual privilegia simplicidade e rapidez de implementação. O principal ponto de atenção arquitetural é que as listagens e filtros usam **scan**, o que funciona para baixo volume, mas pode aumentar custo e latência conforme a base crescer.
   