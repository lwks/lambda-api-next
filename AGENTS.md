# AGENTS.md

Este arquivo orienta agentes que trabalhem neste repositório. As decisões abaixo são específicas para este projeto e devem prevalecer sobre sugestões genéricas.

## Contexto do projeto

- Backend REST em Node.js + Express, preparado para AWS Lambda via `serverless-http`.
- Persistência principal em DynamoDB usando AWS SDK v3.
- Código em CommonJS.
- Estrutura atual baseada em `routes -> controllers -> services -> utils`.
- Há forte reaproveitamento de CRUD em `src/services/entityServiceFactory.js`.

## Objetivo ao editar este repositório

- Preservar simplicidade operacional para execução local e deploy em Lambda.
- Melhorar qualidade sem introduzir abstrações desnecessárias.
- Priorizar testes unitários e cobertura de regras de negócio.
- Manter `README.md` coerente com o comportamento real da API.
- Aplicar SOLID com pragmatismo, especialmente SRP, OCP e DIP.

## Regras de trabalho

- Antes de propor mudanças, ler o código real afetado e confirmar a estrutura existente.
- Não assumir frameworks de teste, lint ou DI container se eles ainda não existirem no projeto.
- Ao alterar comportamento, atualizar também documentação e testes no mesmo trabalho.
- Se uma mudança aumentar acoplamento entre controller, service e acesso a dados, refatorar antes de expandir.
- Evitar adicionar camadas vazias. Nova abstração só entra se remover duplicação relevante ou isolar dependência externa.

## Arquitetura esperada

### Controllers

- Controllers devem cuidar de `req`, `res`, `next`, status HTTP, paginação e serialização de resposta.
- Controllers não devem conter regra de negócio complexa nem detalhes de DynamoDB.
- Validações simples de entrada podem ficar no controller ou em utilitários de validação.

### Services

- Services concentram regra de negócio, integração externa e coordenação entre utilitários.
- Services não devem depender de objetos do Express.
- Ao adicionar lógica específica de entidade, preferir service dedicado em vez de inflar o controller.
- Se `entityServiceFactory` começar a acumular regras específicas de uma entidade, extrair para um service próprio.

### Utils

- `src/utils` deve conter funções puras, erros reutilizáveis, helpers de resposta, paginação e logging.
- Evitar colocar regra de domínio em `utils`.

### Rotas

- As rotas devem apenas mapear endpoints para controllers.
- Manter convenção REST já usada em `/api/candidates`, `/api/companies`, `/api/users`, `/api/jobs` e `/api/zips`.

## SOLID neste repositório

### S: Single Responsibility

- Cada arquivo deve ter uma responsabilidade clara.
- Se um controller começa a validar, transformar, decidir regra de negócio e persistir tudo no mesmo lugar, separar.
- Se um service mistura regra de negócio com construção de resposta HTTP, separar.

### O: Open/Closed

- Preferir extensão por composição e funções auxiliares.
- Evitar editar o factory genérico para encaixar comportamento de uma única entidade, a menos que a regra seja realmente compartilhada.

### L: Liskov

- Funções reutilizáveis devem manter contratos previsíveis.
- Se um helper pode retornar formatos diferentes para cenários parecidos, padronizar antes de ampliar uso.

### I: Interface Segregation

- Mesmo sem TypeScript, manter APIs pequenas entre módulos.
- Não expor objetos gigantes quando uma função precisa de poucos dados.

### D: Dependency Inversion

- Ao escrever código novo com integração externa, preferir receber dependências por parâmetro ou criar pontos simples de injeção.
- Isso vale especialmente para clientes AWS, `fetch`, relógio, UUID e logger quando a testabilidade for importante.

## Política de testes

- Testes unitários são prioridade. Não considerar uma mudança completa sem testes do comportamento principal.
- Para regra pura, testar no menor nível possível.
- Para controllers, testar status code, body e tratamento de erro.
- Para services, mockar DynamoDB, `fetch`, logger e dependências externas.
- Evitar testes frágeis dependentes de relógio real, UUID real ou rede.
- Sempre cobrir:
  - fluxo feliz
  - validação de entrada
  - entidade não encontrada
  - erro de dependência externa
  - paginação e ordenação quando existirem

### Estratégia recomendada

- Se for adicionar testes agora, preferir `jest` + `supertest`.
- `supertest` é adequado para testar `src/app.js` sem subir servidor real.
- Mockar `documentClient.send` para testes de service.
- Mockar `global.fetch` nos fluxos de CEP.

### Casos prioritários para este projeto

- `entityServiceFactory`:
  - `buildUpdateExpression` indireto via `update`
  - `findById` quando item não existe
  - `remove` com falha condicional
  - `list` com paginação
  - `listByFieldValues` paginando múltiplos scans
- `candidateController`:
  - criação com campos obrigatórios
  - `GET /by-job-guids` com CSV, repetidos, vazios e ordenação por `createdAt`
- `zipService`:
  - CEP inválido
  - CEP inexistente
  - resposta incompleta do ViaCEP
  - erro de rede

## Política de README

- Toda mudança funcional deve ser refletida no `README.md` quando alterar:
  - endpoint
  - contrato de request/response
  - variável de ambiente
  - comportamento de erro
  - stack ou fluxo de execução local
- O README deve descrever o estado atual do sistema, não o estado planejado.
- Se o repositório passar a ter testes, incluir:
  - como rodar testes
  - estratégia de testes adotada
  - dependências de teste adicionadas

## Padrões de implementação

- Manter CommonJS, salvo pedido explícito para migrar.
- Reaproveitar `src/utils/errors.js` e `src/utils/response.js` antes de criar novos padrões.
- Preservar formato de resposta:
  - sucesso: `{ data: ... }`
  - erro: `{ message, details? }`
- Preferir funções pequenas e nomes explícitos.
- Logging deve continuar estruturado em JSON.

## Sinais de refatoração obrigatória

- Controller acima de ~100-150 linhas por acúmulo de regra.
- Service genérico recebendo `if` por entidade.
- Duplicação de validação entre controllers.
- Crescimento de branches de erro sem testes correspondentes.
- README divergente do comportamento real das rotas.

## Fluxo esperado para mudanças

1. Ler arquivos relacionados e entender impacto real.
2. Implementar a menor mudança coerente com a arquitetura.
3. Adicionar ou atualizar testes unitários.
4. Atualizar `README.md` se houve mudança funcional.
5. Validar localmente o que for possível.
6. Registrar limitações se algo não puder ser testado.

## O que evitar

- Colocar acesso direto ao DynamoDB dentro de controllers.
- Acoplar regra de negócio a `req` e `res`.
- Adicionar dependência pesada sem necessidade clara.
- Misturar idioma e convenções de nomenclatura sem motivo.
- Alterar contratos HTTP silenciosamente sem atualizar README e testes.

## Sugestões imediatas para evolução do projeto

- Adicionar suíte de testes com `jest` e `supertest`.
- Criar script `test` e opcionalmente `test:watch` no `package.json`.
- Introduzir factories/helpers de teste para payloads de candidate, company, user e job.
- Extrair funções puras reutilizáveis de ordenação e normalização quando a lógica crescer.
- Corrigir textos com encoding quebrado em mensagens do `zipService`.
- Avaliar separar o acesso DynamoDB em um adapter simples se o número de regras crescer além do CRUD genérico atual.

## O que fazer somente com autorização

- Apagar testes unitarios, só faça com minha aprovação.