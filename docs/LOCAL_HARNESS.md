# API no harness local

Requer Node.js 22+ e npm, com os repositórios irmãos `front-nex-ats` e `lambda-api-next`, ambos com as mudanças de `feature/config-harness`.

A partir da pasta pai:

```bash
npm --prefix lambda-api-next ci
npm --prefix front-nex-ats ci
npm --prefix front-nex-ats run dev:local
```

Esse é o ponto de entrada recomendado: sobe auth simulada, API e Next; configura URLs locais nos processos; não depende de AWS, Docker, Supabase real ou arquivos `.env`. Abra http://localhost:3000 e use a barra amarela para selecionar empresa/candidato. A API fica em http://localhost:3001/api e Swagger em http://localhost:3001/docs.

Se o simulador já estiver rodando, `npm run dev:local` neste repositório sobe apenas a API. `HARNESS_BACK_PORT` (padrão 3001) e `E2E_SUPABASE_PORT` (54329) precisam corresponder aos serviços do front.

## Dados e arquivos

O modo local mantém os controllers e guards existentes, trocando apenas persistência, arquivos e CEP por adaptadores locais. O banco JSON e os uploads ficam em `.harness/` e persistem após reiniciar. O comando `npm run local:reset`, com a API parada, restaura o banco fictício e os uploads de exemplo. A trava `server.lock` evita dois processos escrevendo no mesmo diretório. Após encerramento abrupto, o launcher recupera uma trava cujo processo já morreu.

- Vaga: `11111111-1111-4111-8111-111111111111`, dono `company`.
- Candidatura: `22222222-2222-4222-8222-222222222222`, nome `Mariana Local`, com PDF de exemplo.
- Contas: `company`/`COMPANY` e `candidate`/`CANDIDATE`.
- CEPs offline: `01001000`, `01310100`, `20040002`; outros CEPs válidos retornam 404.

O adaptador de CV retorna URLs locais assinadas com duração de cinco minutos, valida tipo/tamanho e preserva o controle de propriedade da vaga no download. Não é uma implementação de S3; não valida IAM ou assinatura S3 real.

`HARNESS_DATA_DIR` permite um diretório descartável alternativo (relativo ao backend ou absoluto). `local:reset` remove os uploads desse diretório. Não aponte para pastas pessoais.

## Validação e isolamento

`npm test` inclui testes de CRUD/paginação local, permissões, upload/download de CV, CEP offline e bloqueio do harness em produção/Lambda. O teste S3 real existente exige configuração própria e continua opcional.

Execute `npm --prefix ../front-nex-ats run test:e2e:local` para testar os dois projetos juntos; adicione `-- api.spec.ts` para integração HTTP sem Chromium. O E2E usa `.harness/e2e`, separado dos dados de desenvolvimento, e portas 3100/3101/54330.

O modo só é permitido em development/test, recusa URL de autenticação remota e runtimes Lambda/Netlify/Vercel. O handler Lambda recusa `HARNESS_MODE=local` antes de carregar o app. `npm run dev` e o handler normal mantêm os serviços reais e suas configurações existentes.

O guia para a pasta pai está em `../front-nex-ats/docs/AGENTS.parent.md`; copie-o para `../AGENTS.md` e abra a pasta pai no Codex.
