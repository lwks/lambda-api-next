# Guia do Front-end (NEX ATS) 

Este documento foi criado para facilitar o trabalho de agentes (Codex) e desenvolvedores no repositório **backend**, explicando de forma prática como o front-end atual funciona, quais telas existem, quais contratos de integração já estão sendo usados e quais flexibilidades de payload/resposta o front já implementa.

> Objetivo: permitir que o backend exponha respostas compatíveis com o front sem precisar deduzir comportamento pela UI.

---

## 1) Visão geral do projeto

- Projeto: **NEX People Solutions / NexJob**.
- Tipo: aplicação web em **Next.js (App Router)**.
- Função principal: publicar vagas e receber candidaturas.
- Linguagem: TypeScript.
- UI: Tailwind + componentes baseados em Radix/ShadCN.

### Stack relevante

- Next.js `16.x`
- React `19.x`
- `fetch` nativo do Next (server/client)
- `lucide-react` para ícones
- API consumida via `NEXT_PUBLIC_API_BASE_URL` (com fallback default no código)

---

## 2) Rotas de tela (front-end)

### `/` — Listagem de vagas

**Comportamento**
- Busca vagas no backend (`GET /jobs` no base URL configurado).
- Renderiza cards com:
  - título
  - empresa
  - localização
  - tipo de trabalho/contratação
  - resumo/descrição
- Ao clicar em “Ver mais”, abre modal com detalhes e botão “Candidatar-se”.

**Regra de candidatura**
- Se API retornar link externo de candidatura (`applyUrl` e variantes), botão abre link externo.
- Caso contrário, fallback para rota interna: `/candidaturas?vaga=<id>`.

---

### `/candidaturas` — Onboarding do candidato (multi-step)

Fluxo em **4 etapas**:
1. Dados pessoais
2. Dados profissionais
3. Upload de currículo (PDF)
4. Interesses profissionais

Ao finalizar:
- Monta payload com dados do candidato.
- Gera `guid_id` no front (`crypto.randomUUID`).
- Preenche `cd_cnpj` com valor aleatório (placeholder temporário no front).
- Envia `POST /api/candidates` (proxy interno do Next), que repassa para backend.

---

### `/jobs/create` — Criação de vaga

Formulário para criação de vaga com validações client-side:
- título mínimo
- descrição mínima
- faixa salarial válida
- CEP com consulta para preencher cidade/estado

Ao salvar:
- Monta payload padronizado para vaga.
- Gera `guid_id` no front.
- Define `status: "Aberto"`.
- Envia `POST /api/jobs` (proxy interno do Next), que repassa para backend.

---

### `/empresa/candidaturas` — Pipeline visual (mock)

- Tela de board Kanban para candidaturas por etapa.
- Atualmente alimentada por **dados mockados locais** (sem integração real).
- Útil como referência de UX para futuras rotas de empresa e movimentação de status.

---

## 3) Endpoints que o front usa hoje

## 3.1 Endpoints diretos ao backend

Base URL: `NEXT_PUBLIC_API_BASE_URL` (se não existir, usa fallback interno no `config.ts`).

- `GET {BASE}/jobs` — listagem de vagas.
- `GET {BASE}/zips/:zip` — consulta CEP (em alguns cenários, via proxy).
- (existe configuração para users/candidates/applications, mas nem tudo está ativo em tela).

## 3.2 Endpoints proxy internos do Next (BFF leve)

Esses endpoints existem no front para contornar CORS, padronizar cabeçalhos e repassar resposta do backend:

- `POST /api/jobs` → repassa para `{BASE}/jobs`
- `POST /api/candidates` → repassa para `{BASE}/candidates`
- `GET /api/zips/:zip` → repassa para `{BASE}/zips/:zip`
- `OPTIONS` em rotas `/api/*` respondem CORS com status `204`

### CORS no front

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

---

## 4) Contratos de payload enviados pelo front

## 4.1 Payload de criação de candidato (`POST /candidates`)

Campos enviados (payload principal):

- `nome: string`
- `documento: string` (CPF ou RG sem máscara)
- `localResidencia: string` (CEP com 8 dígitos)
- `endereco: string`
- `contatoCel: string` (telefone sem máscara)
- `contato: string` (email)
- `lgpdAccepted: boolean` (esperado `true`)
- `experiencia: string`
- `industria: string`
- `salario: string`
- `cargoInteresse: string`
- `industriaInteresse: string`
- `cargoInteresseDetalhado: string`
- `tipoTrabalho: string`
- `tipoContratacao: string`
- `compartilhamentoAccepted: boolean` (esperado `true`)

Campos complementares adicionados pelo front:
- `guid_id: string` (UUID gerado no client)
- `cd_cnpj: string` (placeholder aleatório de 14 dígitos, temporário)

### Observações para backend

- O front bloqueia submit se dados obrigatórios estiverem faltando.
- Se backend exigir campos extras, ideal manter como opcionais inicialmente para evitar quebra.
- Backend deve tolerar strings simples e não depender de enums estritos neste momento.

---

## 4.2 Payload de criação de vaga (`POST /jobs`)

Estrutura enviada:

- `titulo: string`
- `descricao: string` (HTML/texto rico do editor)
- `cargo: string` (`estagiario|analista|coordenador|gerente|diretor`)
- `nivel: string` (`jr|pl|sr|esp`) — pode vir vazio dependendo do cargo
- `localizacao: string` (CEP)
- `modelo_trabalho: string`
- `publicada_em: string` (`YYYY-MM-DD`)
- `formato_contratacao: string` (`pj|integral|temporario|meio_periodo`)
- `exibir_salario: boolean`
- `guid_id: string`
- `status: string` (fixo atual: `"Aberto"`)
- `cidade: string`
- `estado: string`
- `skills: string[]`
- `beneficios: string[]`
- `orcamento: { valor_inicial: number; valor_final: number }`

### Observações para backend

- `skills` e `beneficios` são montados por split de texto (vírgula/quebra de linha).
- `descricao` pode conter HTML.
- Salário pode ser `0` se usuário não preencher adequadamente (front tenta validar, mas backend deve revalidar).

---

## 5) Formatos de resposta tolerados pela listagem de vagas

A listagem de vagas do front é **resiliente** e tenta normalizar diferentes formatos de API.

## 5.1 Coleções aceitas

O front tenta encontrar array de vagas em:

- payload direto `[]`
- `items`
- `results`
- `data`
- `vagas`
- `jobs`
- `content`

Além disso, tenta procurar recursivamente em objetos aninhados.

## 5.2 Campos aceitos por vaga (sinônimos)

Para reduzir fricção, o front aceita múltiplos nomes para o mesmo dado.

### ID
- `id`, `slug`, `codigo`, `uuid`, `guid_id`, `pk`

### Título
- `titulo`, `title`, `nome`

### Empresa
- `company`, `empresa`, `nome_empresa`, `companyId`

### Localização
- `cidade/city` + `estado/uf/state`
- fallback: `localizacao/location`

### Tipo de trabalho/contratação
- `workType`, `tipoTrabalho`, `modalidade`, `tipoContratacao`, `tipo_contratacao`, `modelo_trabalho`, `regime`, `jornada`, `nivel`

### Descrição
- `descricao`, `description`, `resumo`, `summary`

### Link de candidatura
- `applyUrl`, `apply_url`, `link`, `linkCandidatura`, `candidatura_url`, `candidatura_link`

### Dados extras da empresa (modal)
- segmento: `segmento|segment|setor|sector`
- ramo/indústria: `ramo_atuacao|ramoAtuacao|industry|area_atuacao`
- site: `site|website`
- site empresa: `site_empresa|siteEmpresa|companyWebsite`
- e-mail contato: `email|contactEmail|email_contato|contato_email`


## 6) Comportamento da integração de CEP (`/zips/:zip`)

O front espera consultar CEP com 8 dígitos e aceita respostas flexíveis:

Campos entendidos:
- `logradouro|street|address`
- `bairro|neighborhood`
- `localidade|cidade|city`
- `uf|estado|state`
- `cep`

Também aceita payload aninhado em `data`.

### Códigos esperados

- `400` para CEP inválido
- `404` para CEP não encontrado
- `5xx` para falha externa/interna

---

## 7) Validações de front importantes para o backend conhecer

## 7.1 Candidato

- Nome: espera nome completo (>= 2 palavras).
- Documento:
  - aceita CPF (11 dígitos + validação de dígito verificador)
  - ou RG (7 a 10 dígitos)
- Email: regex simples.
- Telefone celular: 10 a 11 dígitos.
- CEP: 8 dígitos + tentativa de preencher cidade/estado.
- Consentimentos (`lgpdAccepted` e `compartilhamentoAccepted`) devem ser `true`.

## 7.2 Vaga

- Título mínimo: 5 chars.
- Descrição mínima: 30 chars (texto limpo sem tags).
- CEP obrigatório e validado com lookup.
- Faixa salarial com validação numérica e relação entre inicial/final.

> Mesmo com validações de front, o backend deve manter validações próprias (fonte de verdade).

---

## 8) Estado atual de maturidade (o que já está em produção de código)

- Integração real ativa:
  - listagem de vagas
  - criação de vaga
  - criação de candidato
  - consulta de CEP
- Funcionalidades ainda mockadas/parciais:
  - board completo de candidaturas da empresa
  - parte de gestão de usuários/empresas
  - vínculo real candidato↔vaga↔empresa em algumas telas

---

## 9) Recomendações práticas para o backend (prioridade alta)

1. **Manter compatibilidade com os campos já enviados pelo front** em `/jobs` e `/candidates`.
2. **Retornar mensagens de erro claras** em JSON (`message`, `error` ou `detail`) — o front já tenta ler esses campos.
3. **Garantir CORS** para ambientes sem proxy (quando front consumir direto).
4. **Padronizar paginação** em listagens (`limit`, `lastKey`) sem quebrar `GET /jobs` simples.
5. **Documentar contrato canônico** e, se possível, manter aliases temporários para transição.
6. **Evitar exigir campos não presentes na UI atual** até existir campo no front.

---

## 10) Variáveis de ambiente relevantes para integração

---

## 11) Resumo executivo para agentes no backend

Se você (Codex) estiver trabalhando no backend para atender este front:

- Priorize funcionamento de:
  - `GET /api/jobs`
  - `POST /api/jobs`
  - `POST /api/candidates`
  - `GET /api/zips/:zip`
- Aceite payloads com nomenclatura atual do front (snake_case PT-BR em boa parte).
- Retorne erros com JSON simples e mensagem legível.
- Em `GET /jobs`, pode retornar coleção em `data` ou array direto (front suporta ambos).
- Sempre que possível inclua `cidade` e `estado` para melhorar exibição de localização.

